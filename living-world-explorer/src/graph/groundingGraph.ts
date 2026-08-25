import type { ContextSnapshotDto, RetrievedItemDto } from '../api/contextClient'
import type { ExecutionHistoryEntry } from '../api/cognitiveClient'

// ─── Grounding Graph — the real per-tick RAG/grounding pipeline ────────────
// Every field here is read verbatim from ContextSnapshotDto / ExecutionHistoryEntry,
// the real, already-persisted evidence for one actor's one planning tick
// (kernel/pipeline/planning/context_engine.py::ContextConstructionEngine.build(),
// persisted by context_snapshot_store.py). No field is fabricated: item_type,
// source, confidence, retrieval_score, timestamp and evidence_ids are exactly
// RetrievedItem's 7 fields — nothing like an embedding score, chunk, page, or
// citation exists in this backend, so none of those appear here. `usedInPrompt`
// and `isNew` are the only *derived* signals (substring checks against the real
// planner_prompt / diff_from_previous), and are always presented as derived.

export type GGNodeKind = 'request' | 'lane' | 'item' | 'grounding-context' | 'prompt' | 'response'
export type OriginArray = 'knowledge' | 'relationships' | 'context_events' | 'experiences' | 'conversations' | 'executions'
export type LaneSourceKind = 'item-source' | 'world-state'

interface GGNodeBase {
  id: string
  kind: GGNodeKind
  label: string
}

export interface RequestNode extends GGNodeBase {
  kind: 'request'
  actorName: string
  goal: string
  startTime: number
  executionId: string
  confidence: number
}

export interface LaneNode extends GGNodeBase {
  kind: 'lane'
  source: string
  sourceKind: LaneSourceKind
  displayName: string
  itemCount: number
  latencyMs: number | null
  latencyStageKeys: string[]
  latencyNote: string | null
  itemIds: string[]
  worldStateDetail?: { locations: string[]; objects: string[]; resources: unknown[] }
}

export interface ItemNode extends GGNodeBase {
  kind: 'item'
  laneId: string
  originArray: OriginArray
  content: string
  itemType: string
  source: string
  confidence: number
  retrievalScore: number
  timestamp: number
  evidenceIds: string[]
  usedInPrompt: boolean
  isNew: boolean
  diffAvailable: boolean
}

export interface GroundingContextNode extends GGNodeBase {
  kind: 'grounding-context'
  capabilities: string[]
  affiliations: Array<Record<string, unknown>>
  observedFacts: unknown[]
  fullLatencyMs: Record<string, number>
}

export interface PromptNode extends GGNodeBase {
  kind: 'prompt'
  promptText: string
  promptTokens: number
  finalPlannerContext: Record<string, unknown>
}

export interface ResponseNode extends GGNodeBase {
  kind: 'response'
  outcome: string
  capabilitiesUsed: string[]
  reward: number | null
  actionsExecuted: number | null
  durationMs: number | null
  worldChanges: string[]
}

export type GGNode = RequestNode | LaneNode | ItemNode | GroundingContextNode | PromptNode | ResponseNode
export interface GGEdge { id: string; source: string; target: string }
export interface GroundingGraph { nodes: GGNode[]; edges: GGEdge[] }

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// ─── Lane grouping + display ────────────────────────────────────────────────
const ORIGIN_ARRAYS: OriginArray[] = ['knowledge', 'relationships', 'context_events', 'experiences', 'conversations', 'executions']

const LANE_DISPLAY_NAMES: Record<string, string> = {
  cognitive_memory: 'Cognitive Memory',
  cognitive_memory_shared: 'Cognitive Memory (Shared)',
  knowledge_graph: 'Retrieved Knowledge',
  context_stream: 'Context Stream',
  'society:interaction': 'Society Interaction',
  'society:tick': 'Society Tick',
  'society:transaction': 'Society Transaction',
  ActionExecutor: 'Action Executor',
  world_state: 'World State',
}

export function laneDisplayName(source: string): string {
  return LANE_DISPLAY_NAMES[source] ?? source
}

const LANE_PRIORITY = ['cognitive_memory', 'cognitive_memory_shared', 'knowledge_graph', 'context_stream', 'society:interaction', 'society:tick', 'society:transaction', 'ActionExecutor']

export function groupItemsBySource(snapshot: ContextSnapshotDto): Map<string, Array<{ item: RetrievedItemDto; originArray: OriginArray }>> {
  const grouped = new Map<string, Array<{ item: RetrievedItemDto; originArray: OriginArray }>>()
  for (const originArray of ORIGIN_ARRAYS) {
    for (const item of snapshot[originArray]) {
      const source = item.source || 'unknown'
      const arr = grouped.get(source) ?? []
      arr.push({ item, originArray })
      grouped.set(source, arr)
    }
  }
  return grouped
}

// The real latency-stage → item-source correspondence, per
// context_engine.py's retrieve() call sites — see plan doc for the full
// derivation. Deliberately does not invent a mapping where none exists.
export function latencyAttributionForSource(source: string, latencyMs: Record<string, number>): { ms: number | null; stageKeys: string[]; note: string | null } {
  if (source === 'knowledge_graph') {
    return { ms: latencyMs.knowledge_graph ?? null, stageKeys: ['knowledge_graph'], note: null }
  }
  if (source === 'cognitive_memory' || source === 'cognitive_memory_shared') {
    return {
      ms: latencyMs.semantic_memory ?? null, stageKeys: ['semantic_memory'],
      note: 'Attributed pipeline stage (semantic_memory) is timed once and shared with cognitive_memory_shared/cognitive_memory.',
    }
  }
  if (source === 'context_stream' || source.startsWith('society:') || source === 'ActionExecutor') {
    return {
      ms: latencyMs.context_stream ?? null, stageKeys: ['context_stream'],
      note: source === 'context_stream' ? null : 'Approximate — this lane’s latency stage (context_stream) is timed once and shared across several real event-provenance sources.',
    }
  }
  if (source === 'world_state') {
    return { ms: latencyMs.world_state ?? null, stageKeys: ['world_state'], note: null }
  }
  return { ms: null, stageKeys: [], note: 'No latency stage maps to this source.' }
}

// Derived, not authoritative: does this item's content actually appear in the
// real prompt text sent to the LLM.
export function usedInPrompt(content: string, plannerPrompt: string): boolean {
  const snippet = content.trim().slice(0, 60)
  if (snippet.length < 8 || !plannerPrompt) return false
  return plannerPrompt.includes(snippet)
}

// Derived, not authoritative: does this item's content match an entry the
// backend recorded as newly added (vs. this actor's previous tick) for its source.
export function isNewItem(source: string, content: string, diff: ContextSnapshotDto['diff_from_previous']): { isNew: boolean; diffAvailable: boolean } {
  if (!diff || diff.is_first_context) return { isNew: false, diffAvailable: false }
  const added = diff.added[source] ?? []
  const isNew = added.some((entry) => typeof entry === 'string' && entry.length > 0 && content.includes(entry.slice(0, 60)))
  return { isNew, diffAvailable: true }
}

// ─── Visual palette ──────────────────────────────────────────────────────────
export interface GGVisual { fg: string; bg: string; border: string }

export function laneVisual(source: string): GGVisual {
  if (source === 'cognitive_memory' || source === 'cognitive_memory_shared') return { fg: '#0F766E', bg: '#F0FDFA', border: '#99F6E4' }
  if (source === 'knowledge_graph') return { fg: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' }
  if (source === 'world_state') return { fg: '#4D7C0F', bg: '#F7FEE7', border: '#D9F99D' }
  return { fg: '#B45309', bg: '#FFFBEB', border: '#FDE68A' } // context_stream + society:*/ActionExecutor + unknown
}

export const NODE_KIND_META: Record<GGNodeKind, GGVisual & { icon: string; label: string }> = {
  request: { fg: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE', icon: '◆', label: 'Request' },
  lane: { fg: '#334155', bg: '#F1F5F9', border: '#CBD5E1', icon: '▤', label: 'Retrieval Lane' },
  item: { fg: '#475569', bg: '#F8FAFC', border: '#E2E8F0', icon: '•', label: 'Retrieved Item' },
  'grounding-context': { fg: '#334155', bg: '#F1F5F9', border: '#CBD5E1', icon: '⊕', label: 'Grounding Context' },
  prompt: { fg: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE', icon: '▣', label: 'Prompt' },
  response: { fg: '#047857', bg: '#ECFDF5', border: '#A7F3D0', icon: '↩', label: 'Response' },
}

// ─── Graph builder ───────────────────────────────────────────────────────────
export function buildGroundingGraph(snapshot: ContextSnapshotDto, execution: ExecutionHistoryEntry, actorName: string): GroundingGraph {
  const nodes: GGNode[] = []
  const edges: GGEdge[] = []
  const addEdge = (source: string, target: string) => edges.push({ id: `${source}->${target}`, source, target })

  const metaExecutionId = execution.metadata.execution_id
  const executionId = typeof metaExecutionId === 'string' && metaExecutionId ? metaExecutionId : execution.entry_id

  nodes.push({
    id: 'request', kind: 'request', label: execution.goal ? truncate(execution.goal, 40) : 'Request',
    actorName, goal: execution.goal || '', startTime: execution.start_time, executionId, confidence: execution.confidence,
  })

  const grouped = groupItemsBySource(snapshot)
  const sources = [...grouped.keys()]
  const ordered = [
    ...LANE_PRIORITY.filter((s) => sources.includes(s)),
    ...sources.filter((s) => !LANE_PRIORITY.includes(s)).sort(),
  ]

  const laneIds: string[] = []
  for (const source of ordered) {
    const items = grouped.get(source)!
    const laneId = `lane:${source}`
    laneIds.push(laneId)
    const { ms, stageKeys, note } = latencyAttributionForSource(source, snapshot.retrieval_latency_ms)
    const itemIds = items.map((_, i) => `item:${source}::${items[i].originArray}::${i}`)
    nodes.push({
      id: laneId, kind: 'lane', label: laneDisplayName(source), source, sourceKind: 'item-source',
      displayName: laneDisplayName(source), itemCount: items.length, latencyMs: ms, latencyStageKeys: stageKeys,
      latencyNote: note, itemIds,
    })
    addEdge('request', laneId)

    items.forEach(({ item, originArray }, index) => {
      const itemId = `item:${source}::${originArray}::${index}`
      const { isNew, diffAvailable } = isNewItem(source, item.content, snapshot.diff_from_previous)
      nodes.push({
        id: itemId, kind: 'item', label: truncate(item.content || '(empty)', 36), laneId, originArray,
        content: item.content, itemType: item.item_type, source: item.source, confidence: item.confidence,
        retrievalScore: item.retrieval_score, timestamp: item.timestamp, evidenceIds: item.evidence_ids,
        usedInPrompt: usedInPrompt(item.content, snapshot.planner_prompt), isNew, diffAvailable,
      })
      addEdge(laneId, itemId)
    })
  }

  const worldStateCount = snapshot.relevant_locations.length + snapshot.relevant_objects.length + snapshot.available_resources.length
  if (worldStateCount > 0) {
    const laneId = 'lane:world_state'
    laneIds.push(laneId)
    const { ms, stageKeys, note } = latencyAttributionForSource('world_state', snapshot.retrieval_latency_ms)
    nodes.push({
      id: laneId, kind: 'lane', label: 'World State', source: 'world_state', sourceKind: 'world-state',
      displayName: 'World State', itemCount: worldStateCount, latencyMs: ms, latencyStageKeys: stageKeys,
      latencyNote: note, itemIds: [],
      worldStateDetail: { locations: snapshot.relevant_locations, objects: snapshot.relevant_objects, resources: snapshot.available_resources },
    })
    addEdge('request', laneId)
  }

  nodes.push({
    id: 'grounding-context', kind: 'grounding-context', label: 'Grounding Context',
    capabilities: snapshot.available_capabilities, affiliations: snapshot.affiliations,
    observedFacts: snapshot.observed_facts, fullLatencyMs: snapshot.retrieval_latency_ms,
  })
  if (laneIds.length > 0) {
    for (const laneId of laneIds) addEdge(laneId, 'grounding-context')
  } else {
    addEdge('request', 'grounding-context')
  }

  nodes.push({
    id: 'prompt', kind: 'prompt', label: 'Prompt', promptText: snapshot.planner_prompt,
    promptTokens: snapshot.prompt_tokens, finalPlannerContext: snapshot.final_planner_context,
  })
  addEdge('grounding-context', 'prompt')

  const worldChanges = Array.isArray(execution.metadata.world_changes) ? execution.metadata.world_changes as string[] : []
  const durationMs = typeof execution.metadata.duration_ms === 'number' ? execution.metadata.duration_ms : null
  nodes.push({
    id: 'response', kind: 'response', label: 'Response', outcome: execution.outcome,
    capabilitiesUsed: execution.capabilities_used, reward: execution.reward ?? null,
    actionsExecuted: execution.actions_executed ?? null, durationMs, worldChanges,
  })
  addEdge('prompt', 'response')

  return { nodes, edges }
}

// ─── Layered pipeline layout (fixed, not force-directed) ────────────────────
export interface GGPosition { x: number; y: number; w: number; h: number }
export interface GGLayout { positions: Map<string, GGPosition>; width: number; height: number }

const DIM: Record<GGNodeKind, { w: number; h: number }> = {
  request: { w: 260, h: 74 },
  lane: { w: 176, h: 64 },
  item: { w: 168, h: 74 },
  'grounding-context': { w: 260, h: 100 },
  prompt: { w: 300, h: 90 },
  response: { w: 260, h: 80 },
}
const MARGIN_X = 40
const ROW_GAP = 56
const ITEM_GAP_Y = 12
const SUBCOL_THRESHOLD = 6

export function layoutGroundingGraph(graph: GroundingGraph, containerWidth: number): GGLayout {
  const positions = new Map<string, GGPosition>()
  const lanes = graph.nodes.filter((n): n is LaneNode => n.kind === 'lane')
  const itemsByLane = new Map<string, ItemNode[]>()
  for (const n of graph.nodes) {
    if (n.kind !== 'item') continue
    const arr = itemsByLane.get(n.laneId) ?? []
    arr.push(n)
    itemsByLane.set(n.laneId, arr)
  }

  const N = Math.max(lanes.length, 1)
  const laneColW = Math.min(240, Math.max(176, (containerWidth - 2 * MARGIN_X) / N))
  const totalW = Math.max(containerWidth, 2 * MARGIN_X + N * laneColW)
  const centerX = totalW / 2

  const place = (id: string, kind: GGNodeKind, cx: number, top: number) => {
    const { w, h } = DIM[kind]
    positions.set(id, { x: cx - w / 2, y: top, w, h })
  }

  place('request', 'request', centerX, MARGIN_X)
  const topLaneRow = MARGIN_X + DIM.request.h + ROW_GAP

  let maxBandHeight = 0
  lanes.forEach((lane, i) => {
    const laneCx = MARGIN_X + laneColW * i + laneColW / 2
    place(lane.id, 'lane', laneCx, topLaneRow)
    const items = itemsByLane.get(lane.id) ?? []
    const subCols = items.length > SUBCOL_THRESHOLD ? 2 : 1
    const subColW = laneColW / subCols
    items.forEach((item, j) => {
      const subCol = j % subCols
      const rowIdx = Math.floor(j / subCols)
      const itemCx = MARGIN_X + laneColW * i + subColW * subCol + subColW / 2
      const itemTop = topLaneRow + DIM.lane.h + ITEM_GAP_Y + rowIdx * (DIM.item.h + ITEM_GAP_Y)
      place(item.id, 'item', itemCx, itemTop)
    })
    const rows = items.length > 0 ? Math.ceil(items.length / subCols) : 0
    const bandHeight = DIM.lane.h + (rows > 0 ? ITEM_GAP_Y + rows * (DIM.item.h + ITEM_GAP_Y) : 0)
    maxBandHeight = Math.max(maxBandHeight, bandHeight)
  })

  const topHub = topLaneRow + (lanes.length > 0 ? maxBandHeight + ROW_GAP : 0)
  place('grounding-context', 'grounding-context', centerX, topHub)
  const topPrompt = topHub + DIM['grounding-context'].h + ROW_GAP
  place('prompt', 'prompt', centerX, topPrompt)
  const topResponse = topPrompt + DIM.prompt.h + ROW_GAP
  place('response', 'response', centerX, topResponse)

  const height = topResponse + DIM.response.h + MARGIN_X
  return { positions, width: totalW, height }
}
