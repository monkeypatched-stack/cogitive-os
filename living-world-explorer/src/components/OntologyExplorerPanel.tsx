import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ONTOLOGY_META, ONTOLOGY_PLURAL, PREDICATE_COLOR, nodeIconPath,
  loadWorld, buildFullGraph, buildExpansion, useWorldSimulation, CLUSTER_ANCHORS,
  type OntologyType, type WorldData, type WNode, type WEdge,
} from '../graph/worldGraph'
import {
  buildAdjacency, bfsShortestPath, findAllPaths, connectedComponents, degreeCentrality,
  betweennessCentrality, stronglyConnectedComponents, labelPropagationCommunities, ANALYTICS_PALETTE,
} from '../graph/algorithms'
import { circularLayout, radialLayout, hierarchicalLayout, geographicLayout, type LayoutMode } from '../graph/layouts'
import { fetchActorCapabilities } from '../api/actorClient'
import { fetchGovernancePolicies, type GovernancePolicy } from '../api/societyClient'
import './OntologyExplorerPanel.css'

type AnalyticsMode = 'none' | 'degree' | 'betweenness' | 'components' | 'communities' | 'scc' | 'trust' | 'communication'
const ANALYTICS_LABEL: Record<AnalyticsMode, string> = {
  none: 'None', degree: 'Degree Centrality', betweenness: 'Betweenness Centrality',
  components: 'Connected Components', communities: 'Communities', scc: 'Strongly Connected Components',
  trust: 'Trust Network', communication: 'Communication Network',
}
const LAYOUT_LABEL: Record<LayoutMode, string> = {
  force: 'Force-directed', organic: 'Organic', circular: 'Circular', radial: 'Radial',
  hierarchical: 'Hierarchical', geographic: 'Geographic',
}

const ONTOLOGY_ALIASES: Record<string, OntologyType> = {
  human: 'human', humans: 'human', person: 'human', people: 'human',
  enterprise: 'enterprise', enterprises: 'enterprise', business: 'enterprise', businesses: 'enterprise', store: 'enterprise', stores: 'enterprise',
  society: 'society', societies: 'society',
  location: 'geo', locations: 'geo', geo: 'geo', place: 'geo', places: 'geo',
  resource: 'product', resources: 'product', product: 'product', products: 'product',
  goal: 'goal', goals: 'goal',
  capability: 'capability', capabilities: 'capability',
  policy: 'policy', policies: 'policy',
}

const EXAMPLE_QUERIES = [
  'find all humans', 'find all enterprises', 'find everything connected to Priya Sharma',
  'find all stores selling Milk', 'find all members of Neighborhood', 'find everyone who trusts Priya Sharma',
  'find all suppliers of Trader Joe\'s',
]

/** A real, bounded pattern-matcher over the exact example query shapes the
 * spec called out — not a general NLP/LLM query engine. Falls back to a
 * plain substring name match (same as the search box always did) when no
 * pattern matches, so the bar is never a dead end. */
function runOntologyQuery(raw: string, nodes: WNode[], edges: WEdge[]): Set<string> | null {
  const q = raw.trim().toLowerCase()
  if (!q) return null
  const byName = (needle: string, ontology?: OntologyType) =>
    nodes.find((n) => (!ontology || n.ontology === ontology) && n.name.toLowerCase() === needle.trim().toLowerCase())
    ?? nodes.find((n) => (!ontology || n.ontology === ontology) && n.name.toLowerCase().includes(needle.trim().toLowerCase()))

  let m = q.match(/^find all ([a-z]+?)s?$/)
  if (m && ONTOLOGY_ALIASES[m[1]]) {
    const type = ONTOLOGY_ALIASES[m[1]]
    return new Set(nodes.filter((n) => n.ontology === type).map((n) => n.id))
  }
  m = q.match(/^find everything connected to (.+)$/)
  if (m) {
    const target = byName(m[1])
    if (target) {
      const adj = buildAdjacency(nodes.map((n) => n.id), edges)
      const comps = connectedComponents(nodes.map((n) => n.id), adj)
      const cid = comps.get(target.id)
      return new Set(nodes.filter((n) => comps.get(n.id) === cid).map((n) => n.id))
    }
  }
  m = q.match(/^find all members of (.+)$/)
  if (m) {
    const society = byName(m[1], 'society')
    if (society) return new Set([society.id, ...edges.filter((e) => e.target === society.id && e.predicate === 'MEMBER_OF').map((e) => e.source)])
  }
  m = q.match(/^find all suppliers of (.+)$/)
  if (m) {
    const ent = byName(m[1], 'enterprise')
    if (ent) return new Set([ent.id, ...edges.filter((e) => e.source === ent.id && e.predicate === 'SUPPLIED_BY').map((e) => e.target)])
  }
  m = q.match(/^find all stores selling (.+)$/)
  if (m) {
    const productIds = new Set(nodes.filter((n) => n.ontology === 'product' && n.name.toLowerCase().includes(m![1].trim())).map((n) => n.id))
    const storeIds = edges.filter((e) => e.predicate === 'HAS_INVENTORY' && productIds.has(e.target)).map((e) => e.source)
    return new Set([...storeIds, ...productIds])
  }
  m = q.match(/^find (?:everyone |everybody )?who trusts (.+)$/)
  if (m) {
    const target = byName(m[1])
    if (target) return new Set([target.id, ...edges.filter((e) => e.target === target.id && (e.trust ?? 0) >= 0.6).map((e) => e.source)])
  }
  return new Set(nodes.filter((n) => n.name.toLowerCase().includes(q)).map((n) => n.id))
}

export function OntologyExplorerPanel() {
  const [world, setWorld] = useState<WorldData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pinnedVisible, setPinnedVisible] = useState<Set<string>>(new Set())
  // Default to Humans / Enterprises / Resources; Capabilities/Policies
  // still exist in the graph and are one click away via the filter chips
  // below. Society/Location/Goal are never in this graph at all (see
  // EXCLUDED_ONTOLOGIES below) so there's no chip to toggle for them here.
  const [hiddenOntologies, setHiddenOntologies] = useState<Set<OntologyType>>(
    new Set<OntologyType>(['capability', 'policy']),
  )
  const [hiddenPredicates, setHiddenPredicates] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force')
  const [analyticsMode, setAnalyticsMode] = useState<AnalyticsMode>('none')
  const [selectedIds, setSelectedIds] = useState<string[]>([]) // ordered; last = primary
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [edgeDirectionFilter, setEdgeDirectionFilter] = useState<'both' | 'out' | 'in'>('both')
  const [pathResult, setPathResult] = useState<{ mode: 'shortest' | 'all'; paths: string[][] } | null>(null)
  const [transform, setTransform] = useState({ x: -260, y: -140, scale: 0.6 })
  const [dims, setDims] = useState({ w: 900, h: 640 })
  const capCache = useRef(new Map<string, string[]>())
  const polCache = useRef(new Map<string, GovernancePolicy[]>())
  const [, forceRerender] = useState(0)
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadWorld().then((w) => { setWorld(w); setError('') })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!canvasRef.current) return
    const obs = new ResizeObserver(([e]) => { if (e) setDims({ w: e.contentRect.width, h: Math.max(480, e.contentRect.height) }) })
    obs.observe(canvasRef.current)
    return () => obs.disconnect()
  }, [])

  const full = useMemo(() => world ? buildFullGraph(world) : { nodes: [] as WNode[], edges: [] as WEdge[] }, [world])

  // Society and Location live in their own dedicated graph (Societies
  // page) now, and Goals are live/runtime state, not slow-changing
  // ontology structure — so this graph never shows any of the three,
  // not even via a filter chip (they simply never enter the node set).
  const EXCLUDED_ONTOLOGIES = useMemo(() => new Set<OntologyType>(['society', 'geo', 'goal']), [])

  const { nodes: graphNodes, edges: graphEdges } = useMemo(() => {
    if (!world) return { nodes: [] as WNode[], edges: [] as WEdge[] }
    const nodes = [...full.nodes]
    const edges = [...full.edges]
    const seenN = new Set(nodes.map((n) => n.id))
    const seenE = new Set(edges.map((e) => e.id))
    for (const id of expanded) {
      const ext = buildExpansion(id, world, capCache.current, polCache.current)
      for (const n of ext.nodes) if (!seenN.has(n.id)) { seenN.add(n.id); nodes.push(n) }
      for (const e of ext.edges) if (!seenE.has(e.id)) { seenE.add(e.id); edges.push(e) }
    }
    const keptNodes = nodes.filter((n) => !EXCLUDED_ONTOLOGIES.has(n.ontology))
    const keptIds = new Set(keptNodes.map((n) => n.id))
    const keptEdges = edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
    return { nodes: keptNodes, edges: keptEdges }
  }, [world, full, expanded, EXCLUDED_ONTOLOGIES])

  const nodesById = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes])

  const queryMatchIds = useMemo(() => runOntologyQuery(query, graphNodes, graphEdges), [query, graphNodes, graphEdges])

  const primarySelectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null

  const visibleNodes = useMemo(() => {
    return graphNodes.filter((n) => {
      if (pinnedVisible.has(n.id)) return true
      if (hiddenOntologies.has(n.ontology)) return false
      if (statusFilter !== 'all' && n.status !== statusFilter) return false
      if (queryMatchIds && !queryMatchIds.has(n.id)) return false
      return true
    })
  }, [graphNodes, hiddenOntologies, statusFilter, queryMatchIds, pinnedVisible])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(() => graphEdges.filter((e) =>
    visibleIds.has(e.source) && visibleIds.has(e.target) && !hiddenPredicates.has(e.predicate),
  ), [graphEdges, visibleIds, hiddenPredicates])

  const adjacency = useMemo(() => buildAdjacency(visibleNodes.map((n) => n.id), visibleEdges), [visibleNodes, visibleEdges])

  // ── Layout ──────────────────────────────────────────────────────────────
  const simNodesRef = useWorldSimulation(visibleNodes, visibleEdges, CLUSTER_ANCHORS, layoutMode === 'organic' ? 0.015 : 0.05)
  const [staticPositions, setStaticPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  useEffect(() => {
    if (layoutMode === 'force' || layoutMode === 'organic') return
    const rootId = primarySelectedId && visibleIds.has(primarySelectedId) ? primarySelectedId : visibleNodes[0]?.id
    if (!rootId) { setStaticPositions(new Map()); return }
    if (layoutMode === 'circular') setStaticPositions(circularLayout(visibleNodes.map((n) => n.id), dims.w / 2, dims.h / 2, Math.min(dims.w, dims.h) / 2 - 80))
    else if (layoutMode === 'radial') setStaticPositions(radialLayout(visibleNodes.map((n) => n.id), rootId, adjacency, dims.w / 2, dims.h / 2, 110))
    else if (layoutMode === 'hierarchical') setStaticPositions(hierarchicalLayout(visibleNodes.map((n) => n.id), rootId, adjacency, dims.w, 110, 60))
    else if (layoutMode === 'geographic') setStaticPositions(geographicLayout(visibleNodes.map((n) => n.id), nodesById, adjacency, dims.w, dims.h - 140).positions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode, visibleNodes, adjacency, dims.w, dims.h, primarySelectedId])

  const getPos = useCallback((id: string): { x: number; y: number } | undefined => {
    if (layoutMode === 'force' || layoutMode === 'organic') {
      const n = simNodesRef.current.find((x) => x.id === id)
      return n && n.x != null && n.y != null ? { x: n.x, y: n.y } : undefined
    }
    return staticPositions.get(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode, staticPositions, simNodesRef.current])

  // ── Analytics overlays ──────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const ids = visibleNodes.map((n) => n.id)
    if (analyticsMode === 'degree') return { kind: 'scalar' as const, values: degreeCentrality(ids, adjacency) }
    if (analyticsMode === 'betweenness') return { kind: 'scalar' as const, values: betweennessCentrality(ids, adjacency) }
    if (analyticsMode === 'components') return { kind: 'group' as const, values: connectedComponents(ids, adjacency) }
    if (analyticsMode === 'communities') return { kind: 'group' as const, values: labelPropagationCommunities(ids, adjacency) }
    if (analyticsMode === 'scc') return { kind: 'group' as const, values: stronglyConnectedComponents(ids, adjacency) }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsMode, visibleNodes, visibleEdges])

  const maxScalar = analytics?.kind === 'scalar' ? Math.max(1e-6, ...analytics.values.values()) : 1

  // ── Selection / expand tools ─────────────────────────────────────────────
  const onNodeClick = (id: string, additive: boolean) => {
    setPathResult(null)
    setSelectedIds((cur) => {
      if (additive) return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      return cur.length === 1 && cur[0] === id ? [] : [id]
    })
    if (!capCache.current.has(id) && world?.actors.some((a) => a.actor_id === id)) {
      fetchActorCapabilities(id).then((caps) => { capCache.current.set(id, caps.map((c) => c.name)); forceRerender((x) => x + 1) }).catch(() => {})
    }
    if (!polCache.current.has(id) && world?.societies.some((s) => s.society_id === id)) {
      fetchGovernancePolicies(id).then((pols) => { polCache.current.set(id, pols); forceRerender((x) => x + 1) }).catch(() => {})
    }
  }

  const expandNHops = (hops: 1 | 2) => {
    if (!world) return
    let frontier = [...selectedIds]
    const toExpand = new Set<string>()
    for (let h = 0; h < hops; h++) {
      const next: string[] = []
      for (const id of frontier) {
        toExpand.add(id)
        const ext = buildExpansion(id, world, capCache.current, polCache.current)
        next.push(...ext.nodes.filter((n) => n.expandable).map((n) => n.id))
      }
      frontier = next
    }
    setExpanded((prev) => new Set([...prev, ...toExpand]))
  }

  const expandConnected = () => {
    if (selectedIds.length === 0) return
    const adj = buildAdjacency(graphNodes.map((n) => n.id), graphEdges)
    const comps = connectedComponents(graphNodes.map((n) => n.id), adj)
    const targetComp = comps.get(selectedIds[selectedIds.length - 1])
    const members = graphNodes.filter((n) => comps.get(n.id) === targetComp).map((n) => n.id)
    setPinnedVisible((prev) => new Set([...prev, ...members]))
  }

  const collapseSubtree = () => {
    setExpanded((prev) => { const n = new Set(prev); for (const id of selectedIds) n.delete(id); return n })
  }

  const findShortestPath = () => {
    if (selectedIds.length !== 2) return
    const path = bfsShortestPath(selectedIds[0], selectedIds[1], adjacency)
    setPathResult({ mode: 'shortest', paths: path ? [path] : [] })
  }
  const findAllPathsBetween = () => {
    if (selectedIds.length !== 2) return
    setPathResult({ mode: 'all', paths: findAllPaths(selectedIds[0], selectedIds[1], adjacency) })
  }

  const highlightedNodeIds = useMemo(() => new Set(pathResult?.paths.flat() ?? []), [pathResult])
  const highlightedEdgeKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const path of pathResult?.paths ?? []) {
      for (let i = 0; i < path.length - 1; i++) { keys.add(`${path[i]}::${path[i + 1]}`); keys.add(`${path[i + 1]}::${path[i]}`) }
    }
    return keys
  }, [pathResult])

  const neighborIds = useMemo(() => {
    const active = hoveredId ?? primarySelectedId
    if (!active) return null
    const s = new Set<string>([active])
    for (const e of visibleEdges) {
      if (edgeDirectionFilter !== 'in' && e.source === active) s.add(e.target)
      if (edgeDirectionFilter !== 'out' && e.target === active) s.add(e.source)
    }
    return s
  }, [hoveredId, primarySelectedId, visibleEdges, edgeDirectionFilter])

  const onWheel = useCallback((e: React.WheelEvent) => { e.preventDefault(); setTransform((t) => ({ ...t, scale: Math.min(3, Math.max(0.1, t.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) })) }, [])
  const onMouseDown = useCallback((e: React.MouseEvent) => { if (e.button !== 0) return; dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY } }, [])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x; const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])
  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  const counts = useMemo(() => { const c: Partial<Record<OntologyType, number>> = {}; for (const n of graphNodes) c[n.ontology] = (c[n.ontology] ?? 0) + 1; return c }, [graphNodes])
  const predicateTypes = useMemo(() => Array.from(new Set(graphEdges.map((e) => e.predicate))).sort(), [graphEdges])
  const statusValues = useMemo(() => Array.from(new Set(graphNodes.map((n) => n.status))).sort(), [graphNodes])

  const primaryNode = primarySelectedId ? nodesById.get(primarySelectedId) : null
  const incomingEdges = primarySelectedId ? graphEdges.filter((e) => e.target === primarySelectedId) : []
  const outgoingEdges = primarySelectedId ? graphEdges.filter((e) => e.source === primarySelectedId) : []

  return (
    <div className="lwe-inspector lwe-agents-content lwe-onto-page">
      <div className="lwe-onto-heading">
        <div>
          <h2>Ontology</h2>
          <p>Semantic memory — everything MonkeyBrain knows. A Neo4j-Bloom-style ontology explorer; changes slowly, unlike World State.</p>
        </div>
        {!loading && !error && <span className="lwe-onto-heading-meta">{graphNodes.length} entities · {graphEdges.length} predicates{selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ''}</span>}
      </div>

      {error && <div className="lwe-onto-error">⚠ {error}</div>}

      {!loading && !error && <>
        <div className="lwe-onto-toolbar">
          <input aria-label="Ontology query" className="lwe-onto-search" placeholder="Query the graph… e.g. find all humans"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="lwe-onto-query-hints">
            {EXAMPLE_QUERIES.slice(0, 4).map((ex) => <button key={ex} type="button" className="lwe-onto-hint-chip" onClick={() => setQuery(ex)}>{ex}</button>)}
          </div>
        </div>

        <div className="lwe-onto-toolbar">
          <div className="lwe-onto-control-group">
            <span className="lwe-onto-control-label">Layout</span>
            {(Object.keys(LAYOUT_LABEL) as LayoutMode[]).map((m) => (
              <button key={m} type="button" className={`lwe-onto-toggle-btn${layoutMode === m ? ' is-active' : ''}`} onClick={() => setLayoutMode(m)}>{LAYOUT_LABEL[m]}</button>
            ))}
          </div>
        </div>

        <div className="lwe-onto-toolbar">
          <div className="lwe-onto-control-group">
            <span className="lwe-onto-control-label">Analytics</span>
            <select aria-label="Analytics overlay" value={analyticsMode} onChange={(e) => setAnalyticsMode(e.target.value as AnalyticsMode)}>
              {(Object.keys(ANALYTICS_LABEL) as AnalyticsMode[]).map((m) => <option key={m} value={m}>{ANALYTICS_LABEL[m]}</option>)}
            </select>
          </div>
          <div className="lwe-onto-control-group">
            <span className="lwe-onto-control-label">Status</span>
            <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              {statusValues.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="lwe-onto-control-group">
            <span className="lwe-onto-control-label">Edges</span>
            {(['both', 'out', 'in'] as const).map((d) => (
              <button key={d} type="button" className={`lwe-onto-toggle-btn${edgeDirectionFilter === d ? ' is-active' : ''}`} onClick={() => setEdgeDirectionFilter(d)}>
                {d === 'both' ? 'Both' : d === 'out' ? 'Outgoing' : 'Incoming'}
              </button>
            ))}
          </div>
        </div>

        <div className="lwe-onto-toolbar">
          <div className="lwe-onto-filters">
            {(Object.keys(ONTOLOGY_META) as OntologyType[]).filter((k) => counts[k]).map((k) => (
              <button key={k} type="button" className={`lwe-onto-filter-chip${hiddenOntologies.has(k) ? ' is-off' : ''}`}
                style={{ '--chip-fg': ONTOLOGY_META[k].fg, '--chip-bg': ONTOLOGY_META[k].bg } as React.CSSProperties}
                onClick={() => setHiddenOntologies((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })}>
                {ONTOLOGY_PLURAL[k]} <span>{counts[k]}</span>
              </button>
            ))}
          </div>
          <div className="lwe-onto-filters">
            {predicateTypes.map((p) => (
              <button key={p} type="button" className={`lwe-onto-predicate-chip${hiddenPredicates.has(p) ? ' is-off' : ''}`}
                onClick={() => setHiddenPredicates((prev) => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="lwe-onto-toolbar lwe-onto-actions-bar">
            <button type="button" className="lwe-onto-action-btn" onClick={() => expandNHops(1)}>Expand 1 hop</button>
            <button type="button" className="lwe-onto-action-btn" onClick={() => expandNHops(2)}>Expand 2 hops</button>
            <button type="button" className="lwe-onto-action-btn" onClick={expandConnected}>Expand connected entities</button>
            <button type="button" className="lwe-onto-action-btn" onClick={collapseSubtree}>Collapse subtree</button>
            {selectedIds.length === 2 && <>
              <button type="button" className="lwe-onto-action-btn is-primary" onClick={findShortestPath}>Highlight shortest path</button>
              <button type="button" className="lwe-onto-action-btn is-primary" onClick={findAllPathsBetween}>Find all paths</button>
            </>}
            {pathResult && <button type="button" className="lwe-onto-action-btn" onClick={() => setPathResult(null)}>Clear path</button>}
            <button type="button" className="lwe-onto-action-btn" onClick={() => setSelectedIds([])}>Clear selection</button>
          </div>
        )}
        {pathResult && (
          <div className="lwe-onto-path-summary">
            {pathResult.mode === 'shortest'
              ? (pathResult.paths[0] ? `Shortest path: ${pathResult.paths[0].length - 1} hops — ${pathResult.paths[0].map((id) => nodesById.get(id)?.name ?? id).join(' → ')}` : 'No path found between the selected entities.')
              : `${pathResult.paths.length} path(s) found (up to 6 hops, capped at 25).`}
          </div>
        )}
      </>}

      <section className="lwe-agents-group lwe-onto-graph-card">
        <div className="lwe-onto-canvas" ref={canvasRef} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          {loading && <div className="lwe-onto-empty"><div className="lwe-onto-spinner" /><span>Loading the ontology…</span></div>}
          {!loading && graphNodes.length === 0 && !error && <div className="lwe-onto-empty"><div className="lwe-onto-empty-icon">◈</div><span>No entities found</span></div>}

          {!loading && graphNodes.length > 0 && (
            <svg className="lwe-onto-svg" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet">
              <defs>
                <marker id="onto-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 Z" fill="#C7CDD9" /></marker>
                <marker id="onto-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 Z" fill="#2563EB" /></marker>
                <filter id="onto-card-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.08" /></filter>
              </defs>
              <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
                {visibleEdges.map((edge) => {
                  const sp = getPos(edge.source); const tp = getPos(edge.target)
                  if (!sp || !tp) return null
                  const onPath = highlightedEdgeKeys.has(`${edge.source}::${edge.target}`)
                  const active = neighborIds ? neighborIds.has(edge.source) && neighborIds.has(edge.target) : false
                  const dimmed = (neighborIds != null && !active && !onPath) || (highlightedNodeIds.size > 0 && !onPath)
                  let color = PREDICATE_COLOR[edge.predicate] || '#D8DCE6'
                  let width = 2
                  if (analyticsMode === 'trust' && edge.trust != null) { color = edge.trust >= 0.7 ? '#22C55E' : edge.trust >= 0.4 ? '#F59E0B' : '#EF4444'; width = 1 + edge.trust * 3 }
                  const dx = tp.x - sp.x, dy = tp.y - sp.y, dist = Math.hypot(dx, dy) || 1
                  const ux = dx / dist, uy = dy / dist
                  const srcMeta = ONTOLOGY_META[nodesById.get(edge.source)?.ontology ?? 'human']
                  const tgtMeta = ONTOLOGY_META[nodesById.get(edge.target)?.ontology ?? 'human']
                  const x1 = sp.x + ux * Math.max(srcMeta.w, srcMeta.h) / 2, y1 = sp.y + uy * Math.max(srcMeta.w, srcMeta.h) / 2
                  const x2 = tp.x - ux * (Math.max(tgtMeta.w, tgtMeta.h) / 2 + 6), y2 = tp.y - uy * (Math.max(tgtMeta.w, tgtMeta.h) / 2 + 6)
                  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
                  const bend = 16 * (edge.id.charCodeAt(0) % 2 === 0 ? 1 : -1)
                  const cx = mx + (-uy) * bend, cy = my + ux * bend
                  return (
                    <g key={edge.id} style={{ opacity: dimmed ? 0.1 : onPath ? 1 : active ? 1 : 0.5 }}>
                      <path className="lwe-onto-edge" d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`} stroke={onPath ? '#2563EB' : active ? color : '#D8DCE6'}
                        strokeWidth={onPath ? 3 : width} markerEnd={onPath ? 'url(#onto-arrow-active)' : 'url(#onto-arrow)'} />
                      {(active || onPath) && <text x={cx} y={cy} textAnchor="middle" className="lwe-onto-edge-label" fill={onPath ? '#2563EB' : color}>{edge.predicate}</text>}
                    </g>
                  )
                })}
                {visibleNodes.map((n) => {
                  const pos = getPos(n.id)
                  if (!pos) return null
                  const meta = ONTOLOGY_META[n.ontology]
                  const isActive = neighborIds ? neighborIds.has(n.id) : true
                  const onPath = highlightedNodeIds.has(n.id)
                  const isSelected = selectedIds.includes(n.id)
                  let ring: string | null = null
                  let scalarScale = 1
                  if (analytics?.kind === 'group') { const g = analytics.values.get(n.id); if (g != null) ring = ANALYTICS_PALETTE[g % ANALYTICS_PALETTE.length] }
                  if (analytics?.kind === 'scalar') { const v = analytics.values.get(n.id) ?? 0; scalarScale = 0.85 + (v / maxScalar) * 0.5 }
                  return (
                    <g key={n.id} className={`lwe-onto-node${isSelected ? ' is-selected' : ''}${onPath ? ' is-onpath' : ''}`}
                      transform={`translate(${pos.x},${pos.y}) scale(${scalarScale})`}
                      style={{ opacity: highlightedNodeIds.size > 0 ? (onPath ? 1 : 0.15) : isActive ? 1 : 0.3 }}
                      tabIndex={0} role="button" aria-label={`${n.name}, ${meta.label}, ${n.status}`}
                      onMouseEnter={() => setHoveredId(n.id)} onMouseLeave={() => setHoveredId(null)}
                      onClick={(e) => onNodeClick(n.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                      onDoubleClick={(e) => { e.stopPropagation(); if (n.expandable) setExpanded((prev) => { const s = new Set(prev); s.has(n.id) ? s.delete(n.id) : s.add(n.id); return s }) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') onNodeClick(n.id, e.shiftKey) }}
                    >
                      <rect className="lwe-onto-node-card" x={-meta.w / 2} y={-meta.h / 2} width={meta.w} height={meta.h} rx={14}
                        fill="#FFFFFF" stroke={ring ?? (isSelected ? meta.fg : '#E8EAF0')} strokeWidth={isSelected || ring ? 2.5 : 1} filter="url(#onto-card-shadow)" />
                      <g transform={`translate(${-meta.w / 2 + 12}, ${-8})`}><g transform="scale(0.68)" className="lwe-onto-node-icon" stroke={meta.fg}>{nodeIconPath(n.ontology, n.subtype)}</g></g>
                      <text className="lwe-onto-node-name" x={-meta.w / 2 + 38} y={-meta.h / 2 + 20}>{n.name.length > 18 ? `${n.name.slice(0, 17)}…` : n.name}</text>
                      <g transform={`translate(${-meta.w / 2 + 38}, ${-meta.h / 2 + 28})`}>
                        <rect width={Math.min(10 + meta.label.length * 5.6, meta.w - 50)} height={14} rx={7} fill={meta.bg} />
                        <text x={6} y={10} className="lwe-onto-node-badge" fill={meta.fg}>{meta.label}</text>
                      </g>
                      {analytics?.kind === 'scalar' && <text className="lwe-onto-node-metric" x={meta.w / 2 - 8} y={-meta.h / 2 + 12} textAnchor="end">{(analytics.values.get(n.id) ?? 0).toFixed(1)}</text>}
                    </g>
                  )
                })}
              </g>
            </svg>
          )}
        </div>

        {primaryNode && (
          <aside className="lwe-onto-inspector">
            <div className="lwe-onto-inspector-header">
              <div>
                <span className="lwe-onto-inspector-badge" style={{ background: ONTOLOGY_META[primaryNode.ontology].bg, color: ONTOLOGY_META[primaryNode.ontology].fg }}>{ONTOLOGY_META[primaryNode.ontology].label}</span>
                <h3>{primaryNode.name}</h3>
              </div>
              <button type="button" className="lwe-onto-inspector-close" onClick={() => setSelectedIds([])} aria-label="Close inspector">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="lwe-onto-inspector-body">
              <div className="lwe-onto-inspector-section">
                <div className="lwe-onto-inspector-section-title">Identity</div>
                <dl className="lwe-onto-inspector-fields">
                  <div><dt>Entity ID</dt><dd className="lwe-onto-mono">{primaryNode.id}</dd></div>
                  <div><dt>Ontology Class</dt><dd>{ONTOLOGY_META[primaryNode.ontology].label}</dd></div>
                  <div><dt>Status</dt><dd>{primaryNode.status}</dd></div>
                </dl>
              </div>
              <div className="lwe-onto-inspector-section">
                <div className="lwe-onto-inspector-section-title">Labels</div>
                <div className="lwe-onto-chip-row">
                  <span className="lwe-onto-inline-chip">{ONTOLOGY_META[primaryNode.ontology].label}</span>
                  <span className="lwe-onto-inline-chip">{primaryNode.subtype}</span>
                  {primaryNode.expandable && <span className="lwe-onto-inline-chip">expandable</span>}
                </div>
              </div>
              <div className="lwe-onto-inspector-section">
                <div className="lwe-onto-inspector-section-title">Properties</div>
                <dl className="lwe-onto-inspector-fields">
                  {rawFieldEntries(primaryNode).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
              </div>
              <div className="lwe-onto-inspector-section">
                <div className="lwe-onto-inspector-section-title">Outgoing relationships ({outgoingEdges.length})</div>
                <ul className="lwe-onto-relations-list">
                  {outgoingEdges.slice(0, 25).map((e) => <li key={e.id}><span className="lwe-onto-relation-predicate">{e.predicate}</span> → {nodesById.get(e.target)?.name ?? e.target}</li>)}
                </ul>
              </div>
              <div className="lwe-onto-inspector-section">
                <div className="lwe-onto-inspector-section-title">Incoming relationships ({incomingEdges.length})</div>
                <ul className="lwe-onto-relations-list">
                  {incomingEdges.slice(0, 25).map((e) => <li key={e.id}><span className="lwe-onto-relation-predicate">{e.predicate}</span> ← {nodesById.get(e.source)?.name ?? e.source}</li>)}
                </ul>
              </div>
            </div>
          </aside>
        )}
      </section>
    </div>
  )
}

function rawFieldEntries(node: WNode): [string, string][] {
  const raw = node.raw as Record<string, unknown>
  const entries: [string, string][] = []
  const skip = new Set(['actor_id', 'society_id', 'entity_id', 'id', 'name', 'store_id', 'raw'])
  for (const [k, v] of Object.entries(raw)) {
    if (skip.has(k) || v == null || v === '') continue
    if (Array.isArray(v)) { if (v.length === 0) continue; entries.push([k, v.length > 4 ? `${v.slice(0, 4).join(', ')}…` : v.join(', ')]); continue }
    if (typeof v === 'object') continue
    entries.push([k, String(v)])
  }
  return entries.slice(0, 10)
}
