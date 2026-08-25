import type { CanonicalGraphDto } from '../api/planClient'

// ─── Plan Analyzer graph model — the real ExecutionGraph, laid out ────────
// One real node kind (every node the planner returns has type "execution"
// in this backend today — see planClient.ts). dependsOn is derived from the
// real edges, the same way the backend itself derives dependencies
// internally (api/routes/execute.py::_graph_to_plan_steps's deps dict) —
// not a second source of truth, just the same edges read the same way.

export interface PGNode {
  id: string
  name: string
  agent: string
  type: string
  agents: string[]
  dependsOn: string[]
}

export interface PGEdge {
  id: string
  source: string
  target: string
}

export interface PlanGraph {
  nodes: PGNode[]
  edges: PGEdge[]
  layers: string[][]
}

export function buildPlanGraph(graph: CanonicalGraphDto): PlanGraph {
  const dependsOn = new Map<string, string[]>()
  for (const n of graph.nodes) dependsOn.set(n.id, [])
  for (const e of graph.edges) {
    if (!dependsOn.has(e.to)) continue
    dependsOn.get(e.to)!.push(e.from)
  }

  const nodes: PGNode[] = graph.nodes.map((n) => ({
    id: n.id,
    name: n.name || n.id,
    agent: n.agent || '',
    type: n.type || '',
    agents: n.agents ?? [],
    dependsOn: dependsOn.get(n.id) ?? [],
  }))

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges: PGEdge[] = graph.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e, i) => ({ id: `${e.from}->${e.to}#${i}`, source: e.from, target: e.to }))

  return { nodes, edges, layers: deriveLayers(graph, nodeIds) }
}

// Primary source of truth: the planner's own execution_order (real parallel
// batches — a layer with more than one node IS real branching, not
// inferred). Falls back to a topological layering computed fresh from the
// real edges only when execution_order is missing/empty or doesn't cover
// every node (defensive against a partial/stale array) — never a guess,
// always edge-derived either way.
function deriveLayers(graph: CanonicalGraphDto, nodeIds: Set<string>): string[][] {
  const provided = (graph.execution_order ?? [])
    .map((layer) => layer.filter((id) => nodeIds.has(id)))
    .filter((layer) => layer.length > 0)
  const coveredIds = new Set(provided.flat())
  if (provided.length > 0 && coveredIds.size === nodeIds.size) return provided

  // Kahn's algorithm topological layering over the real edges.
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of nodeIds) { indeg.set(id, 0); adj.set(id, []) }
  for (const e of graph.edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue
    adj.get(e.from)!.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }

  const layers: string[][] = []
  const seen = new Set<string>()
  let frontier = [...nodeIds].filter((id) => indeg.get(id) === 0)
  while (frontier.length > 0) {
    layers.push(frontier)
    for (const id of frontier) seen.add(id)
    const next: string[] = []
    for (const id of frontier) {
      for (const target of adj.get(id) ?? []) {
        indeg.set(target, indeg.get(target)! - 1)
        if (indeg.get(target) === 0) next.push(target)
      }
    }
    frontier = next
  }
  // Anything left unseen indicates a real cycle in the data (the planner's
  // own validation rejects CYCLE_DETECTED before this could happen — but
  // render it honestly as a final catch-all layer rather than silently
  // dropping nodes or looping forever if it ever does).
  const remainder = [...nodeIds].filter((id) => !seen.has(id))
  if (remainder.length > 0) layers.push(remainder)
  return layers
}

// ─── Layout — deterministic, layered by real batch index ──────────────────
export interface PGPosition { x: number; y: number; w: number; h: number }
export type PGLayout = Map<string, PGPosition>

const NODE_W = 200
const NODE_H = 64
const COL_GAP = 40
const ROW_GAP = 56
const MARGIN = 32

export function layoutPlanGraph(graph: PlanGraph, containerWidth: number): { positions: PGLayout; width: number; height: number } {
  const positions: PGLayout = new Map()
  const rowWidth = (n: number) => n * NODE_W + Math.max(0, n - 1) * COL_GAP
  const maxRowN = Math.max(1, ...graph.layers.map((l) => l.length))
  const totalW = Math.max(containerWidth, 2 * MARGIN + rowWidth(maxRowN))
  const centerX = totalW / 2

  graph.layers.forEach((layer, rowIdx) => {
    const w = rowWidth(layer.length)
    const startX = centerX - w / 2
    layer.forEach((id, colIdx) => {
      positions.set(id, {
        x: startX + colIdx * (NODE_W + COL_GAP),
        y: MARGIN + rowIdx * (NODE_H + ROW_GAP),
        w: NODE_W,
        h: NODE_H,
      })
    })
  })

  const totalH = MARGIN * 2 + graph.layers.length * NODE_H + Math.max(0, graph.layers.length - 1) * ROW_GAP
  return { positions, width: totalW, height: totalH }
}
