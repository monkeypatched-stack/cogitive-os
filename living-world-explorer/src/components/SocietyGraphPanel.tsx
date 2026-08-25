import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ONTOLOGY_META, ONTOLOGY_PLURAL, PREDICATE_COLOR, nodeIconPath,
  loadWorld, buildFullGraph, useWorldSimulation, CLUSTER_ANCHORS,
  type OntologyType, type WorldData, type WNode, type WEdge,
} from '../graph/worldGraph'
import { useRefreshStore } from '../store/refreshStore'
import './SocietyGraphPanel.css'

// Known synthetic bootstrap-scaffolding names created unconditionally by
// PlanetaryRuntime.__init__ (kernel/society/integration.py) the first time
// it boots against an empty GeographicRegistry — before real geography
// (e.g. seed_world.py's "Earth") exists. The backend's
// reconcile_default_geography migrates real Societies off this chain and
// deletes it once a real canonical root exists, but this exclusion list is
// defense-in-depth for any world state where reconciliation hasn't run —
// never render internal bootstrap scaffolding as if it were a real place.
const SYNTHETIC_GEO_NAMES = new Set([
  'Default Planet', 'Default Country', 'Default State', 'Default County',
  'Default City', 'Default Street', 'Default Building', 'Default Space',
])

/** The dedicated Society graph — Societies, their real physical Location
 * (via HOSTS) and their real members (via MEMBER_OF: Human/Enterprise
 * actor nodes with a real membership, sourced from each actor's real
 * Affiliation records — same "member_of" mirror the membership CRUD in
 * SocietiesPanel.tsx writes through, not a client-side approximation),
 * split out of the Ontology Explorer so societies get their own focused
 * view rather than competing for space with every other ontology type.
 * Reuses the exact same real world-graph data/edges as the other two
 * graphs (worldGraph.tsx) — nothing re-derived or re-fetched separately. */
export function SocietyGraphPanel() {
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)
  const [world, setWorld] = useState<WorldData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hiddenOntologies, setHiddenOntologies] = useState<Set<OntologyType>>(new Set())
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: -40, y: -20, scale: 0.8 })
  const [dims, setDims] = useState({ w: 900, h: 560 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadWorld().then((w) => { setWorld(w); setError('') })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
    // Membership CRUD (MembershipsTable in SocietiesPanel.tsx) calls
    // bumpRefresh() after every add/edit/remove — refetch so a member
    // added or removed there shows up here without a page reload.
  }, [refreshSeq])

  useEffect(() => {
    if (!canvasRef.current) return
    const obs = new ResizeObserver(([e]) => { if (e) setDims({ w: e.contentRect.width, h: Math.max(360, e.contentRect.height) }) })
    obs.observe(canvasRef.current)
    return () => obs.disconnect()
  }, [])

  // Societies + their real members (MEMBER_OF: Human/Enterprise actor
  // nodes) + their real Location (HOSTS/PART_OF) — everything else the
  // base graph carries (products, goals, capabilities, policies) is
  // dropped. Real edges kept: MEMBER_OF (actor -> society, sourced from
  // each actor's real Affiliation records), HOSTS (society -> its
  // physical location), and PART_OF (location -> location, so a hosted
  // Space still traces back to its real City rather than floating as an
  // orphan). Synthetic bootstrap geography (SYNTHETIC_GEO_NAMES) is never
  // rendered as a real place.
  const { nodes: graphNodes, edges: graphEdges } = useMemo(() => {
    if (!world) return { nodes: [] as WNode[], edges: [] as WEdge[] }
    const base = buildFullGraph(world)
    const societyIds = new Set(base.nodes.filter((n) => n.ontology === 'society').map((n) => n.id))
    const hostsEdges = base.edges.filter((e) => e.predicate === 'HOSTS' && societyIds.has(e.source))
    const memberEdges = base.edges.filter((e) => e.predicate === 'MEMBER_OF' && societyIds.has(e.target))
    const keepIds = new Set<string>(societyIds)
    for (const e of hostsEdges) { keepIds.add(e.source); keepIds.add(e.target) }
    for (const e of memberEdges) { keepIds.add(e.source); keepIds.add(e.target) }
    // Pull in the PART_OF chain for any Location node so a hosted Space
    // still traces back to its real City, not a dangling orphan node.
    for (const n of base.nodes) {
      if (n.ontology === 'geo' && keepIds.has(n.id)) {
        let cur = n.parentId
        while (cur) { keepIds.add(cur); cur = base.nodes.find((p) => p.id === cur)?.parentId }
      }
    }
    const relevantEdges = [...hostsEdges, ...memberEdges]
    for (const e of base.edges) if (e.predicate === 'PART_OF' && keepIds.has(e.source) && keepIds.has(e.target)) relevantEdges.push(e)
    const nodes = base.nodes.filter((n) =>
      keepIds.has(n.id) &&
      (n.ontology === 'society' || n.ontology === 'human' || n.ontology === 'enterprise' ||
       (n.ontology === 'geo' && !SYNTHETIC_GEO_NAMES.has(n.name))))
    const keptNodeIds = new Set(nodes.map((n) => n.id))
    const edges = Array.from(new Map(relevantEdges.map((e) => [e.id, e])).values()).filter((e) => keptNodeIds.has(e.source) && keptNodeIds.has(e.target))
    return { nodes, edges }
  }, [world])

  const nodesById = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes])

  const visibleNodes = useMemo(() => {
    const q = query.trim().toLowerCase()
    return graphNodes.filter((n) => !hiddenOntologies.has(n.ontology) && (!q || n.name.toLowerCase().includes(q)))
  }, [graphNodes, hiddenOntologies, query])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(() => graphEdges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)), [graphEdges, visibleIds])

  const nodesRef = useWorldSimulation(visibleNodes, visibleEdges, CLUSTER_ANCHORS, 0.06)

  const neighborIds = useMemo(() => {
    const active = hoveredId ?? selectedId
    if (!active) return null
    const s = new Set<string>([active])
    for (const e of visibleEdges) { if (e.source === active) s.add(e.target); if (e.target === active) s.add(e.source) }
    return s
  }, [hoveredId, selectedId, visibleEdges])

  const onWheel = useCallback((e: React.WheelEvent) => { e.preventDefault(); setTransform((t) => ({ ...t, scale: Math.min(3, Math.max(0.15, t.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) })) }, [])
  const onMouseDown = useCallback((e: React.MouseEvent) => { if (e.button !== 0) return; dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY } }, [])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x; const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])
  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  const counts = useMemo(() => { const c: Partial<Record<OntologyType, number>> = {}; for (const n of graphNodes) c[n.ontology] = (c[n.ontology] ?? 0) + 1; return c }, [graphNodes])
  const selectedNode = selectedId ? nodesById.get(selectedId) : null

  return (
    <section className="lwe-agents-group lwe-sg-section">
      <div className="lwe-agents-group-heading">
        <h2>Society graph <span>{loading ? '…' : `${graphNodes.length} entities · ${graphEdges.length} predicates`}</span></h2>
        <input aria-label="Search societies graph" className="lwe-sg-search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {error && <div className="lwe-inspector-error">Unable to load: {error}</div>}
      {!error && (
        <div className="lwe-sg-filters">
          {(Object.keys(ONTOLOGY_META) as OntologyType[]).filter((k) => counts[k]).map((k) => (
            <button key={k} type="button" className={`lwe-sg-filter-chip${hiddenOntologies.has(k) ? ' is-off' : ''}`}
              style={{ '--chip-fg': ONTOLOGY_META[k].fg, '--chip-bg': ONTOLOGY_META[k].bg } as React.CSSProperties}
              onClick={() => setHiddenOntologies((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })}>
              {ONTOLOGY_PLURAL[k]} <span>{counts[k]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="lwe-sg-graph-card">
        <div className="lwe-sg-canvas" ref={canvasRef} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          {loading && <div className="lwe-sg-empty">Loading societies…</div>}
          {!loading && graphNodes.length === 0 && !error && <div className="lwe-sg-empty">No societies found</div>}
          {!loading && graphNodes.length > 0 && (
            <svg className="lwe-sg-svg" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet">
              <defs>
                <marker id="sg-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5 Z" fill="#C7CDD9" /></marker>
                <filter id="sg-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#0F172A" floodOpacity="0.08" /></filter>
              </defs>
              <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
                {visibleEdges.map((edge) => {
                  const sp = nodesRef.current.find((n) => n.id === edge.source); const tp = nodesRef.current.find((n) => n.id === edge.target)
                  if (!sp || !tp || sp.x == null || tp.x == null) return null
                  const active = neighborIds ? neighborIds.has(edge.source) && neighborIds.has(edge.target) : false
                  const dimmed = neighborIds != null && !active
                  const color = PREDICATE_COLOR[edge.predicate] || '#D8DCE6'
                  return <line key={edge.id} className="lwe-sg-edge" x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                    stroke={active ? color : '#D8DCE6'} style={{ opacity: dimmed ? 0.1 : 1 }} markerEnd="url(#sg-arrow)" />
                })}
                {visibleNodes.map((n) => {
                  const live = nodesRef.current.find((x) => x.id === n.id)
                  if (!live || live.x == null || live.y == null) return null
                  const meta = ONTOLOGY_META[n.ontology]
                  const isActive = neighborIds ? neighborIds.has(n.id) : true
                  const isSelected = selectedId === n.id
                  return (
                    <g key={n.id} transform={`translate(${live.x},${live.y})`} style={{ opacity: isActive ? 1 : 0.3 }}
                      tabIndex={0} role="button" aria-label={`${n.name}, ${meta.label}`}
                      onMouseEnter={() => setHoveredId(n.id)} onMouseLeave={() => setHoveredId(null)}
                      onClick={() => setSelectedId((cur) => (cur === n.id ? null : n.id))}>
                      <rect x={-meta.w / 2} y={-meta.h / 2} width={meta.w} height={meta.h} rx={14} fill="#FFFFFF"
                        stroke={isSelected ? meta.fg : '#E8EAF0'} strokeWidth={isSelected ? 2.5 : 1} filter="url(#sg-shadow)" />
                      <g transform={`translate(${-meta.w / 2 + 12}, ${-8})`}><g transform="scale(0.68)" stroke={meta.fg} className="lwe-sg-node-icon">{nodeIconPath(n.ontology, n.subtype)}</g></g>
                      <text className="lwe-sg-node-name" x={-meta.w / 2 + 38} y={-meta.h / 2 + 20}>{n.name.length > 18 ? `${n.name.slice(0, 17)}…` : n.name}</text>
                      <g transform={`translate(${-meta.w / 2 + 38}, ${-meta.h / 2 + 28})`}>
                        <rect width={Math.min(10 + meta.label.length * 5.6, meta.w - 50)} height={14} rx={7} fill={meta.bg} />
                        <text x={6} y={10} className="lwe-sg-node-badge" fill={meta.fg}>{meta.label}</text>
                      </g>
                    </g>
                  )
                })}
              </g>
            </svg>
          )}
        </div>
        {selectedNode && (
          <aside className="lwe-sg-inspector">
            <div className="lwe-sg-inspector-header">
              <span className="lwe-sg-inspector-badge" style={{ background: ONTOLOGY_META[selectedNode.ontology].bg, color: ONTOLOGY_META[selectedNode.ontology].fg }}>{ONTOLOGY_META[selectedNode.ontology].label}</span>
              <h4>{selectedNode.name}</h4>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Close">✕</button>
            </div>
            <div className="lwe-sg-inspector-body">
              <div><dt>Status</dt><dd>{selectedNode.status}</dd></div>
              <div className="lwe-sg-relations-title">Relationships</div>
              <ul>
                {graphEdges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).map((e) => {
                  const otherId = e.source === selectedNode.id ? e.target : e.source
                  const dir = e.source === selectedNode.id ? '→' : '←'
                  return <li key={e.id}><span>{e.predicate}</span> {dir} {nodesById.get(otherId)?.name ?? otherId}</li>
                })}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </section>
  )
}
