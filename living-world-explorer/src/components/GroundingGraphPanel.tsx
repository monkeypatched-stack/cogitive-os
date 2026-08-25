import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorldStore } from '../store/worldStore'
import { useRefreshStore } from '../store/refreshStore'
import { fetchActorCognitiveState, type ActorCognitiveState, type ExecutionHistoryEntry } from '../api/cognitiveClient'
import { sendActorPrompt } from '../api/promptClient'
import {
  fetchExecutionPlanningContext, fetchExecutionSemanticMemory,
  type ContextSnapshotDto, type SemanticMemoryDto,
} from '../api/contextClient'
import { fetchProducts, fetchMerchants, type Product, type Merchant } from '../api/commerceClient'
import { readable, formatTime } from './inspectorPrimitives'
import {
  buildGroundingGraph, layoutGroundingGraph, laneVisual, NODE_KIND_META, truncate,
  type GGNode, type GGPosition, type ItemNode, type LaneNode,
} from '../graph/groundingGraph'
import './GroundingGraphPanel.css'

// ─── Component ──────────────────────────────────────────────────────────────
// Visualizes the real grounding/RAG pipeline for one actor's most recent
// execution tick: what was retrieved, why, and whether it actually made it
// into the prompt sent to the LLM. Every field shown comes straight from
// ContextSnapshotDto / ExecutionHistoryEntry (see graph/groundingGraph.ts for
// the exact real-field mapping) — not a generic semantic-web knowledge graph,
// not SittingFace, not internal world state.

const EXAMPLE_QUERIES = ['Buy milk', 'Find cheapest eggs', 'Reserve restaurant', 'Schedule meeting']

function nodeVisual(node: GGNode): { fg: string; bg: string; border: string; icon: string } {
  if (node.kind === 'lane' || node.kind === 'item') {
    const v = laneVisual(node.source)
    return { ...v, icon: NODE_KIND_META[node.kind].icon }
  }
  return NODE_KIND_META[node.kind]
}

// Cross-references a retrieved item's real evidence_id (the first one IS
// the KG entity_id — see kernel/pipeline/planning/context_engine.py::
// _explore_knowledge's `evidence_ids=(entity.entity_id,)`) against the real
// Product/Merchant catalog, so two items that share a display name (e.g.
// "Large Eggs (Dozen)" at two different stores) resolve to their own
// distinct store + authoritative catalog price — never merged or deduped
// just because the name matches.
function resolveProduct(
  item: ItemNode, productById: Map<string, Product>, storeNameById: Map<string, string>,
): { product: Product; storeName: string } | null {
  const productId = item.evidenceIds[0]
  const product = productId ? productById.get(productId) : undefined
  if (!product) return null
  return { product, storeName: storeNameById.get(product.store_id) ?? product.store_id }
}

function edgePath(sp: GGPosition, tp: GGPosition): string {
  const x1 = sp.x + sp.w / 2, y1 = sp.y + sp.h
  const x2 = tp.x + tp.w / 2, y2 = tp.y
  const my = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${my} ${x2} ${my} ${x2} ${y2}`
}

export function GroundingGraphPanel() {
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)

  const [cognitiveState, setCognitiveState] = useState<ActorCognitiveState | null>(null)
  const [executionEntry, setExecutionEntry] = useState<ExecutionHistoryEntry | null>(null)
  const [executionId, setExecutionId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<ContextSnapshotDto | null>(null)
  const [semanticMemory, setSemanticMemory] = useState<SemanticMemoryDto | null>(null)
  const [error, setError] = useState('')
  const [runningExample, setRunningExample] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const lastActorIdRef = useRef<string | null>(null)

  const [search, setSearch] = useState('')
  const [hiddenLanes, setHiddenLanes] = useState<Set<string>>(new Set())
  const [hiddenItemTypes, setHiddenItemTypes] = useState<Set<string>>(new Set())
  const [usedInPromptOnly, setUsedInPromptOnly] = useState(false)
  const [minConfidence, setMinConfidence] = useState(0)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 20, y: 20, scale: 1 })
  const [dims, setDims] = useState({ w: 900, h: 700 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)
  const centeredForExecution = useRef<string | null>(null)

  // Commerce catalog — real Store/Product entities (commerceClient.ts),
  // fetched once and cross-referenced against retrieved knowledge items
  // below so two same-named products (e.g. two stores each listing
  // "Large Eggs (Dozen)") render as visibly distinct nodes: Store, real
  // catalog price, and product id, not just a truncated shared label.
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchProducts(), fetchMerchants()])
      .then(([p, m]) => { if (!cancelled) { setProducts(p); setMerchants(m) } })
      .catch(() => { /* best-effort enrichment only — grounding data itself doesn't depend on it */ })
    return () => { cancelled = true }
  }, [])
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const storeNameById = useMemo(() => new Map(merchants.map((m) => [m.store_id, m.name])), [merchants])

  // ── Actor change: load ALL executions, select the actual latest one ─────
  // Execution-scoped, not "latest grounding available": the default
  // selection is the actor's real latest execution by timestamp — never
  // filtered by "has execution_id" or "has a grounding snapshot." An
  // execution with no snapshot is a real, valid state (grounding was
  // skipped/reused, or this is a legacy pre-fix record) shown explicitly,
  // not silently skipped in favor of an older one that happens to render.
  useEffect(() => {
    const switchingActor = lastActorIdRef.current !== selectedActorId
    lastActorIdRef.current = selectedActorId
    if (switchingActor) {
      setCognitiveState(null); setExecutionEntry(null); setExecutionId(null)
      setSnapshot(null); setSemanticMemory(null); setError(''); setSelectedNodeId(null)
    }
    if (!selectedActorId) return
    let cancelled = false
    fetchActorCognitiveState(selectedActorId)
      .then((result) => {
        if (cancelled) return
        setCognitiveState(result)
        const sorted = [...result.execution_history].sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0))
        setExecutionEntry((current) => {
          // Preserve the user's manual selection across a live refresh —
          // only auto-jump to the new latest when nothing was explicitly
          // picked yet, or the actor changed.
          if (!switchingActor && current) {
            const stillThere = sorted.find((e) => e.entry_id === current.entry_id)
            if (stillThere) return stillThere
          }
          return sorted[0] ?? null
        })
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [selectedActorId, refreshSeq])

  useEffect(() => {
    setExecutionId(executionEntry && typeof executionEntry.metadata.execution_id === 'string' && executionEntry.metadata.execution_id
      ? (executionEntry.metadata.execution_id as string) : null)
  }, [executionEntry])

  const groundingPerformed = executionEntry ? (executionEntry.metadata.grounding_performed as boolean | undefined) : undefined
  const groundingSkipReason = executionEntry ? (executionEntry.metadata.grounding_skip_reason as string | undefined) || '' : ''
  const [snapshotState, setSnapshotState] = useState<'idle' | 'loading' | 'loaded' | 'not-performed' | 'legacy-no-id' | 'integrity-warning'>('idle')

  // ── Execution selection change: fetch that exact execution's snapshot ──
  // never fall back to a different execution if this one has none.
  useEffect(() => {
    setSnapshot(null); setSemanticMemory(null); setSelectedNodeId(null)
    if (!selectedActorId || !executionEntry) { setSnapshotState('idle'); return }
    if (!executionId) { setSnapshotState('legacy-no-id'); return }
    if (groundingPerformed === false) { setSnapshotState('not-performed'); return }
    let cancelled = false
    setSnapshotState('loading')
    Promise.all([
      fetchExecutionPlanningContext(selectedActorId, executionId),
      fetchExecutionSemanticMemory(selectedActorId, executionId),
    ]).then(([snap, memory]) => {
      if (cancelled) return
      // Data-integrity invariant: the snapshot we got back must actually
      // belong to the execution we asked for — never render it as if it
      // did when it doesn't.
      if (snap.execution_id !== executionId) { setSnapshotState('integrity-warning'); return }
      setSnapshot({
        ...snap,
        affiliations: snap.affiliations ?? [],
        available_resources: snap.available_resources ?? [],
        retrieval_sources: snap.retrieval_sources ?? [],
        retrieval_latency_ms: snap.retrieval_latency_ms ?? {},
        relevant_locations: snap.relevant_locations ?? [],
        relevant_objects: snap.relevant_objects ?? [],
        available_capabilities: snap.available_capabilities ?? [],
        observed_facts: snap.observed_facts ?? [],
        final_planner_context: snap.final_planner_context ?? {},
      })
      setSemanticMemory({
        ...memory,
        retrieved_this_execution: memory.retrieved_this_execution ?? { experiences: [], conversations: [] },
        durable_beliefs: memory.durable_beliefs ?? [],
      })
      setSnapshotState('loaded')
      setError('')
    }).catch(() => {
      if (cancelled) return
      // A real execution_id with grounding_performed !== false but no
      // retrievable snapshot is a genuine data-integrity gap (e.g. a save
      // failure) — surfaced as a warning, never silently treated as "no
      // grounding," which would be a fabricated explanation.
      setSnapshotState('integrity-warning')
    })
    return () => { cancelled = true }
  }, [selectedActorId, executionEntry, executionId, groundingPerformed])

  useEffect(() => {
    if (!canvasRef.current) return
    const obs = new ResizeObserver(([e]) => { if (e) setDims({ w: e.contentRect.width, h: Math.max(480, e.contentRect.height) }) })
    obs.observe(canvasRef.current)
    return () => obs.disconnect()
  }, [])

  const graph = useMemo(() => (
    snapshot && executionEntry && cognitiveState
      ? buildGroundingGraph(snapshot, executionEntry, cognitiveState.identity.name)
      : null
  ), [snapshot, executionEntry, cognitiveState])

  const layout = useMemo(() => graph ? layoutGroundingGraph(graph, dims.w) : null, [graph, dims.w])

  // Re-center once per newly loaded execution — not on every pan/zoom/filter.
  useEffect(() => {
    if (!layout || !executionId || centeredForExecution.current === executionId) return
    centeredForExecution.current = executionId
    const scale = Math.min(1, dims.w / layout.width)
    setTransform({ x: Math.max(16, (dims.w - layout.width * scale) / 2), y: 16, scale })
  }, [layout, executionId, dims.w])

  const allExecutions = useMemo(
    () => cognitiveState ? [...cognitiveState.execution_history].sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0)) : [],
    [cognitiveState],
  )

  const laneNodes = useMemo(() => (graph?.nodes.filter((n): n is LaneNode => n.kind === 'lane')) ?? [], [graph])
  const itemNodes = useMemo(() => (graph?.nodes.filter((n): n is ItemNode => n.kind === 'item')) ?? [], [graph])
  const itemTypes = useMemo(() => [...new Set(itemNodes.map((n) => n.itemType))].sort(), [itemNodes])

  const hiddenItemIds = useMemo(() => {
    const q = search.trim().toLowerCase()
    const hidden = new Set<string>()
    for (const n of itemNodes) {
      const fails = (
        (hiddenLanes.has(n.source)) ||
        (hiddenItemTypes.has(n.itemType)) ||
        (usedInPromptOnly && !n.usedInPrompt) ||
        (n.confidence < minConfidence) ||
        (q && !n.content.toLowerCase().includes(q))
      )
      if (fails) hidden.add(n.id)
    }
    return hidden
  }, [itemNodes, search, hiddenLanes, hiddenItemTypes, usedInPromptOnly, minConfidence])

  const visibleNodes = useMemo(() => graph ? graph.nodes.filter((n) => !(n.kind === 'item' && hiddenItemIds.has(n.id))) : [], [graph, hiddenItemIds])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(() => graph ? graph.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)) : [], [graph, visibleIds])

  const neighborIds = useMemo(() => {
    const active = hoveredNodeId ?? selectedNodeId
    if (!active || !graph) return null
    const s = new Set<string>([active])
    for (const e of graph.edges) { if (e.source === active) s.add(e.target); if (e.target === active) s.add(e.source) }
    return s
  }, [hoveredNodeId, selectedNodeId, graph])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setTransform((t) => ({ ...t, scale: Math.min(3, Math.max(0.15, t.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) }))
  }, [])
  const onMouseDown = useCallback((e: React.MouseEvent) => { if (e.button !== 0) return; dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY } }, [])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x; const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])
  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  const toggleLane = (source: string) => setHiddenLanes((prev) => { const n = new Set(prev); n.has(source) ? n.delete(source) : n.add(source); return n })
  const toggleItemType = (t: string) => setHiddenItemTypes((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })

  const selectedNode = graph?.nodes.find((n) => n.id === selectedNodeId) ?? null
  const totalItems = itemNodes.length
  const visibleItemCount = totalItems - hiddenItemIds.size

  // Runs a real prompt as the selected actor's next planetary tick (same
  // POST /prompt as ChatPanel) so this empty state can actually produce the
  // execution it's showing the user how to read, instead of staying inert.
  const runExample = async (question: string) => {
    if (!selectedActorId || runningExample) return
    setRunningExample(question)
    setError('')
    try {
      const response = await sendActorPrompt(selectedActorId, question)
      if (response.query_result?.llm_answered) {
        useRefreshStore.getState().bumpRefresh()
      } else {
        setError(response.query_result?.answer || 'The planetary cycle did not run for this message.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunningExample(null)
    }
  }

  if (!selectedActorId) {
    return <div className="lwe-gg-page">
      <div className="lwe-inspector-muted" style={{ padding: 12 }}>
        Select an actor (World Tree — BY ACTOR, or the Map) to see the real grounding pipeline for a specific execution.
      </div>
    </div>
  }

  return (
    <div className="lwe-inspector lwe-agents-content lwe-gg-page">
      <div className="lwe-gg-heading">
        <div>
          <h2>Grounding Graph</h2>
          <p>What knowledge was retrieved and injected into the LLM prompt for ONE specific execution — always exactly the execution selected below, never a silent fallback to an older one.</p>
        </div>
        {graph && <span className="lwe-gg-heading-meta">
          {visibleItemCount}/{totalItems} items shown · {laneNodes.length} lanes · {snapshot?.prompt_tokens ?? 0} prompt tokens · {semanticMemory?.durable_beliefs.length ?? 0} durable beliefs
        </span>}
      </div>

      {error && <div className="lwe-gg-error">⚠ {error}</div>}

      {allExecutions.length === 0 && (
        <div className="lwe-gg-try-example">
          <p className="lwe-inspector-muted">No executions recorded for this actor yet. Execute a query to generate a grounding graph.</p>
          <div className="lwe-gg-example-row">
            {EXAMPLE_QUERIES.map((q) => (
              <button key={q} type="button" className="lwe-gg-example-btn" disabled={runningExample !== null} onClick={() => runExample(q)}>
                {runningExample === q ? 'Running…' : q}
              </button>
            ))}
          </div>
        </div>
      )}

      {allExecutions.length > 0 && (
        <div className="lwe-gg-exec-selector">
          <div className="lwe-gg-exec-selector-label">Executions ({allExecutions.length})</div>
          <div className="lwe-gg-exec-list">
            {allExecutions.map((entry) => {
              const execId = typeof entry.metadata.execution_id === 'string' ? entry.metadata.execution_id : ''
              const performed = entry.metadata.grounding_performed as boolean | undefined
              const isSelected = entry.entry_id === executionEntry?.entry_id
              return <button
                key={entry.entry_id} type="button"
                className={`lwe-gg-exec-row${isSelected ? ' is-selected' : ''}`}
                onClick={() => setExecutionEntry(entry)}
              >
                <span className="lwe-gg-exec-time">{formatTime(entry.start_time)}</span>
                <span className="lwe-gg-exec-goal">{readable(entry.goal)}</span>
                <span className={`lwe-gg-exec-status lwe-gg-exec-status-${entry.outcome}`}>{entry.outcome}</span>
                {!execId && <span className="lwe-gg-exec-badge lwe-gg-exec-badge-legacy">legacy — no execution_id</span>}
                {execId && performed === false && <span className="lwe-gg-exec-badge lwe-gg-exec-badge-skipped">grounding reused</span>}
              </button>
            })}
          </div>
        </div>
      )}

      {snapshotState === 'legacy-no-id' && (
        <div className="lwe-gg-empty-state">
          <strong>Legacy execution record — no execution_id.</strong>
          <p>This execution predates reliable execution_id recording (a real backend gap, now fixed for new executions). No grounding data can be looked up for it, and none is fabricated here.</p>
        </div>
      )}
      {snapshotState === 'not-performed' && (
        <div className="lwe-gg-empty-state">
          <strong>Grounding not performed for this execution.</strong>
          <p>Reason: {groundingSkipReason || 'not recorded'}.</p>
        </div>
      )}
      {snapshotState === 'integrity-warning' && (
        <div className="lwe-gg-error">
          ⚠ Data integrity warning: this execution was recorded as having performed grounding, but no matching snapshot could be found (or the snapshot returned belongs to a different execution_id). Not rendering a graph rather than showing possibly-wrong data.
        </div>
      )}
      {snapshotState === 'loading' && <div className="lwe-gg-empty"><div className="lwe-gg-spinner" /><span>Assembling the grounding pipeline…</span></div>}

      {graph && layout && (
        <>
          <div className="lwe-gg-toolbar">
            <input aria-label="Search retrieved content" className="lwe-gg-search" placeholder="Search retrieved content…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="lwe-gg-filters">
              {laneNodes.map((lane) => {
                const v = laneVisual(lane.source)
                return <button key={lane.id} type="button" className={`lwe-gg-filter-chip${hiddenLanes.has(lane.source) ? ' is-off' : ''}`}
                  style={{ '--chip-fg': v.fg, '--chip-bg': v.bg } as React.CSSProperties}
                  onClick={() => toggleLane(lane.source)}>
                  {lane.displayName} <span>{lane.itemCount}</span>
                </button>
              })}
            </div>
            <div className="lwe-gg-filters">
              {itemTypes.map((t) => (
                <button key={t} type="button" className={`lwe-gg-filter-chip lwe-gg-filter-chip-type${hiddenItemTypes.has(t) ? ' is-off' : ''}`}
                  onClick={() => toggleItemType(t)}>{t}</button>
              ))}
            </div>
            <button type="button" className={`lwe-gg-toggle${usedInPromptOnly ? ' is-on' : ''}`} onClick={() => setUsedInPromptOnly((v) => !v)}>
              Used in prompt only
            </button>
            <label className="lwe-gg-confidence">
              Min confidence {minConfidence.toFixed(2)}
              <input type="range" min={0} max={1} step={0.05} value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} />
            </label>
          </div>

          <section className="lwe-agents-group lwe-gg-graph-card">
            <div className="lwe-gg-canvas" ref={canvasRef} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
              <svg className="lwe-gg-svg" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet">
                <defs>
                  <marker id="gg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 Z" fill="#C7CDD9" /></marker>
                  <filter id="gg-card-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.08" /></filter>
                </defs>
                <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
                  {visibleEdges.map((edge) => {
                    const sp = layout.positions.get(edge.source); const tp = layout.positions.get(edge.target)
                    if (!sp || !tp) return null
                    const active = neighborIds ? neighborIds.has(edge.source) && neighborIds.has(edge.target) : false
                    const dimmed = neighborIds != null && !active
                    return <path key={edge.id} className="lwe-gg-edge" d={edgePath(sp, tp)} markerEnd="url(#gg-arrow)"
                      style={{ opacity: dimmed ? 0.12 : active ? 1 : 0.45 }} />
                  })}
                  {visibleNodes.map((n) => {
                    const pos = layout.positions.get(n.id)
                    if (!pos) return null
                    const v = nodeVisual(n)
                    const isActive = neighborIds ? neighborIds.has(n.id) : true
                    const isSelected = selectedNodeId === n.id
                    return (
                      <g key={n.id} className={`lwe-gg-node${isSelected ? ' is-selected' : ''}`}
                        transform={`translate(${pos.x},${pos.y})`} style={{ opacity: isActive ? 1 : 0.3 }}
                        tabIndex={0} role="button" aria-label={n.label}
                        onMouseEnter={() => setHoveredNodeId(n.id)} onMouseLeave={() => setHoveredNodeId(null)}
                        onClick={() => setSelectedNodeId((cur) => (cur === n.id ? null : n.id))}
                        onKeyDown={(e) => { if (e.key === 'Enter') setSelectedNodeId((cur) => (cur === n.id ? null : n.id)) }}
                      >
                        <rect className="lwe-gg-node-card" width={pos.w} height={pos.h} rx={12}
                          fill={v.bg} stroke={isSelected ? v.fg : v.border} strokeWidth={isSelected ? 2 : 1} filter="url(#gg-card-shadow)" />
                        <text className="lwe-gg-node-icon" x={12} y={22} fill={v.fg}>{v.icon}</text>
                        <text className="lwe-gg-node-name" x={30} y={22}>{truncate(n.label, n.kind === 'item' ? 20 : 26)}</text>
                        {n.kind === 'lane' && <text className="lwe-gg-node-sub" x={12} y={42}>{n.itemCount} item{n.itemCount === 1 ? '' : 's'}{n.latencyMs != null ? ` · ${n.latencyMs.toFixed(1)}ms` : ''}</text>}
                        {n.kind === 'item' && (() => {
                          const resolved = resolveProduct(n, productById, storeNameById)
                          return <>
                            {resolved
                              ? <text className="lwe-gg-node-sub" x={12} y={40}>{resolved.storeName} · ${resolved.product.price.toFixed(2)}</text>
                              : <text className="lwe-gg-node-sub" x={12} y={40}>{n.itemType} · conf {n.confidence.toFixed(2)}</text>}
                            <text className="lwe-gg-node-sub" x={12} y={54}>
                              {resolved ? `${n.itemType} · conf ${n.confidence.toFixed(2)}` : `id ${n.evidenceIds[0] ? truncate(n.evidenceIds[0], 22) : 'n/a'}`}
                            </text>
                          </>
                        })()}
                        {n.kind === 'item' && (n.usedInPrompt || n.isNew) && <text className="lwe-gg-node-badges" x={12} y={pos.h - 8}>{n.usedInPrompt ? '✓ in prompt' : ''}{n.usedInPrompt && n.isNew ? ' · ' : ''}{n.isNew ? '● new' : ''}</text>}
                        {n.kind === 'prompt' && <text className="lwe-gg-node-sub" x={12} y={42}>{n.promptTokens} tokens</text>}
                        {n.kind === 'grounding-context' && <text className="lwe-gg-node-sub" x={12} y={42}>{n.capabilities.length} capabilities · {n.affiliations.length} affiliations</text>}
                        {n.kind === 'response' && <text className="lwe-gg-node-sub" x={12} y={42}>{n.reward != null ? `reward ${n.reward.toFixed(2)}` : 'no reward recorded'}</text>}
                      </g>
                    )
                  })}
                </g>
              </svg>
            </div>

            {selectedNode && (
              <aside className="lwe-gg-inspector">
                <div className="lwe-gg-inspector-header">
                  <div>
                    <span className="lwe-gg-inspector-badge" style={{ background: nodeVisual(selectedNode).bg, color: nodeVisual(selectedNode).fg }}>
                      {selectedNode.kind === 'lane' || selectedNode.kind === 'item' ? selectedNode.source : NODE_KIND_META[selectedNode.kind].label}
                    </span>
                    <h3>{selectedNode.label}</h3>
                  </div>
                  <button type="button" className="lwe-gg-inspector-close" onClick={() => setSelectedNodeId(null)} aria-label="Close inspector">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
                <div className="lwe-gg-inspector-body">
                  {selectedNode.kind === 'request' && <dl className="lwe-inspector-fields">
                    <div><dt>Actor</dt><dd>{selectedNode.actorName}</dd></div>
                    <div><dt>Goal / Request</dt><dd>{readable(selectedNode.goal)}</dd></div>
                    <div><dt>Started</dt><dd>{formatTime(selectedNode.startTime)}</dd></div>
                    <div><dt>Execution ID</dt><dd className="lwe-gg-mono">{selectedNode.executionId}</dd></div>
                    <div><dt>Confidence</dt><dd>{selectedNode.confidence.toFixed(2)}</dd></div>
                  </dl>}

                  {selectedNode.kind === 'lane' && <>
                    <dl className="lwe-inspector-fields">
                      <div><dt>Source (raw)</dt><dd className="lwe-gg-mono">{selectedNode.source}</dd></div>
                      <div><dt>Item count</dt><dd>{selectedNode.itemCount}</dd></div>
                      <div><dt>Attributed latency</dt><dd>{selectedNode.latencyMs != null ? `${selectedNode.latencyMs.toFixed(2)}ms (${selectedNode.latencyStageKeys.join(', ')})` : 'No latency stage maps to this source'}</dd></div>
                    </dl>
                    {selectedNode.latencyNote && <div className="lwe-inspector-hint">{selectedNode.latencyNote}</div>}
                    {selectedNode.worldStateDetail && <>
                      <div className="lwe-gg-inspector-section-title">Locations ({selectedNode.worldStateDetail.locations.length})</div>
                      <ul className="lwe-inspector-list">{selectedNode.worldStateDetail.locations.map((l, i) => <li key={i}>{l}</li>)}</ul>
                      <div className="lwe-gg-inspector-section-title">Objects ({selectedNode.worldStateDetail.objects.length})</div>
                      <ul className="lwe-inspector-list">{selectedNode.worldStateDetail.objects.map((o, i) => <li key={i}>{o}</li>)}</ul>
                      <div className="lwe-gg-inspector-section-title">Resources ({selectedNode.worldStateDetail.resources.length})</div>
                      <ul className="lwe-inspector-list">{selectedNode.worldStateDetail.resources.map((r, i) => <li key={i}>{readable(r)}</li>)}</ul>
                    </>}
                  </>}

                  {selectedNode.kind === 'item' && (() => {
                    const resolved = resolveProduct(selectedNode, productById, storeNameById)
                    return <dl className="lwe-inspector-fields">
                      {resolved && <>
                        <div><dt>Product Name</dt><dd>{resolved.product.name}</dd></div>
                        <div><dt>Store</dt><dd>{resolved.storeName}</dd></div>
                        <div><dt>Product ID</dt><dd className="lwe-gg-mono">{resolved.product.id}</dd></div>
                        <div><dt>Price</dt><dd>${resolved.product.price.toFixed(2)}</dd></div>
                      </>}
                      <div><dt>Content</dt><dd>{readable(selectedNode.content)}</dd></div>
                      <div><dt>Item Type</dt><dd>{selectedNode.itemType}</dd></div>
                      <div><dt>Source</dt><dd className="lwe-gg-mono">{selectedNode.source}</dd></div>
                      <div><dt>Retrieval confidence</dt><dd>{selectedNode.confidence.toFixed(2)}</dd></div>
                      <div><dt>Retrieval Score</dt><dd>{selectedNode.retrievalScore.toFixed(3)}</dd></div>
                      <div><dt>Timestamp</dt><dd>{formatTime(selectedNode.timestamp)}</dd></div>
                      <div><dt>Evidence IDs</dt><dd>{selectedNode.evidenceIds.length > 0 ? selectedNode.evidenceIds.join(', ') : 'None recorded'}</dd></div>
                      <div><dt>Retrieved via</dt><dd>{selectedNode.originArray}</dd></div>
                      <div><dt>In Prompt</dt><dd>{selectedNode.usedInPrompt ? 'Yes' : 'No'} <span className="lwe-inspector-hint-inline">(derived — substring match against planner_prompt)</span></dd></div>
                      <div><dt>New vs. previous tick</dt><dd>{selectedNode.diffAvailable ? (selectedNode.isNew ? 'Yes' : 'No') : 'Not available — first planning cycle for this actor'} {selectedNode.diffAvailable && <span className="lwe-inspector-hint-inline">(derived — diff_from_previous.added)</span>}</dd></div>
                    </dl>
                  })()}

                  {selectedNode.kind === 'grounding-context' && <>
                    <div className="lwe-gg-inspector-section-title">Available Capabilities</div>
                    <div className="lwe-gg-chip-row">{selectedNode.capabilities.length > 0 ? selectedNode.capabilities.map((c) => <span key={c} className="lwe-gg-inline-chip">{c}</span>) : <span className="lwe-inspector-muted">None recorded.</span>}</div>
                    <div className="lwe-gg-inspector-section-title">Affiliations ({selectedNode.affiliations.length})</div>
                    <ul className="lwe-inspector-list">{selectedNode.affiliations.length > 0 ? selectedNode.affiliations.map((a, i) => <li key={i}>{readable(a.society_name ?? a.society_id ?? a)}</li>) : <li className="lwe-inspector-muted">None recorded.</li>}</ul>
                    <div className="lwe-gg-inspector-section-title">Observed Facts ({selectedNode.observedFacts.length})</div>
                    <ul className="lwe-inspector-list">{selectedNode.observedFacts.length > 0 ? selectedNode.observedFacts.map((f, i) => <li key={i}>{readable(f)}</li>) : <li className="lwe-inspector-muted">None recorded.</li>}</ul>
                    <div className="lwe-gg-inspector-section-title">Internal pipeline timing — not retrieved items</div>
                    <table className="lwe-gg-timing-table"><tbody>
                      {Object.entries(selectedNode.fullLatencyMs).map(([stage, ms]) => {
                        const itemless = ['timeline', 'organizational', 'actor_profile', 'affiliation_graph', 'presence_history', 'capabilities'].includes(stage)
                        return <tr key={stage}><td>{stage}</td><td>{ms.toFixed(2)}ms</td><td className="lwe-inspector-hint-inline">{itemless ? 'ran, but produced no items retained in this snapshot' : ''}</td></tr>
                      })}
                    </tbody></table>
                  </>}

                  {selectedNode.kind === 'prompt' && <>
                    <dl className="lwe-inspector-fields">
                      <div><dt>Prompt Tokens</dt><dd>{selectedNode.promptTokens}</dd></div>
                    </dl>
                    <div className="lwe-gg-inspector-section-title">Full prompt text</div>
                    <pre className="lwe-gg-pre">{selectedNode.promptText || 'Not available'}</pre>
                    <div className="lwe-gg-inspector-section-title">final_planner_context</div>
                    {Object.entries(selectedNode.finalPlannerContext).length > 0
                      ? <dl className="lwe-inspector-fields">
                        {Object.entries(selectedNode.finalPlannerContext).map(([k, v]) => (
                          <div key={k}><dt>{k}</dt><dd>{typeof v === 'object' && v !== null ? <pre className="lwe-gg-pre">{JSON.stringify(v, null, 2)}</pre> : readable(v)}</dd></div>
                        ))}
                      </dl>
                      : <div className="lwe-inspector-muted">None recorded.</div>}
                  </>}

                  {selectedNode.kind === 'response' && <dl className="lwe-inspector-fields">
                    <div><dt>Outcome</dt><dd>{readable(selectedNode.outcome)}</dd></div>
                    <div><dt>Capabilities Used</dt><dd>{selectedNode.capabilitiesUsed.length > 0 ? selectedNode.capabilitiesUsed.join(', ') : 'None recorded'}</dd></div>
                    <div><dt>Reward</dt><dd>{selectedNode.reward != null ? selectedNode.reward.toFixed(3) : 'Not available'}</dd></div>
                    <div><dt>Actions Executed</dt><dd>{selectedNode.actionsExecuted ?? 'Not available'}</dd></div>
                    <div><dt>Duration</dt><dd>{selectedNode.durationMs != null ? `${selectedNode.durationMs.toFixed(0)}ms` : 'Not available'}</dd></div>
                    <div><dt>World Changes</dt><dd>{selectedNode.worldChanges.length > 0 ? selectedNode.worldChanges.join(', ') : 'None recorded'}</dd></div>
                  </dl>}
                </div>
              </aside>
            )}
          </section>
        </>
      )}
    </div>
  )
}
