import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { fetchActorCapabilities } from '../api/actorClient'
import { fetchGovernancePolicies, type GovernancePolicy } from '../api/societyClient'
import {
  ONTOLOGY_META, ONTOLOGY_PLURAL, PREDICATE_COLOR, nodeIconPath,
  loadWorld, buildBaseGraph, buildExpansion, useWorldSimulation,
  type OntologyType, type WorldData, type WNode, type WEdge,
} from '../graph/worldGraph'
import type { Actor, Society } from '../api/actorClient'
import type { GeoEntity } from '../api/geoClient'
import type { Product } from '../api/commerceClient'
import './KnowledgeGraphPanel.css'

// ─── Component ──────────────────────────────────────────────────────────────
const REFRESH_MS = 30000

export function KnowledgeGraphPanel() {
  const [world, setWorld] = useState<WorldData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [hiddenOntologies, setHiddenOntologies] = useState<Set<OntologyType>>(new Set())
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: -260, y: -140, scale: 0.72 })
  const [dims, setDims] = useState({ w: 900, h: 620 })
  const capCache = useRef(new Map<string, string[]>())
  const polCache = useRef(new Map<string, GovernancePolicy[]>())
  const [, forceRerender] = useState(0)
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)
  const prevWorldRef = useRef<{ ids: Set<string> } | null>(null)
  const [enteringIds, setEnteringIds] = useState<Set<string>>(new Set())

  const load = useCallback((isRefresh: boolean) => {
    loadWorld().then((w) => {
      if (isRefresh && prevWorldRef.current) {
        const newIds = new Set([...w.actors.map((a) => a.actor_id), ...w.societies.map((s) => s.society_id)])
        const added = [...newIds].filter((id) => !prevWorldRef.current!.ids.has(id))
        if (added.length > 0) {
          setEnteringIds(new Set(added))
          setTimeout(() => setEnteringIds(new Set()), 900)
        }
      }
      prevWorldRef.current = { ids: new Set([...w.actors.map((a) => a.actor_id), ...w.societies.map((s) => s.society_id)]) }
      setWorld(w); setError('')
    }).catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load(false)
    const interval = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (!canvasRef.current) return
    const obs = new ResizeObserver(([e]) => { if (e) setDims({ w: e.contentRect.width, h: Math.max(480, e.contentRect.height) }) })
    obs.observe(canvasRef.current)
    return () => obs.disconnect()
  }, [])

  const base = useMemo(() => world ? buildBaseGraph(world) : { nodes: [], edges: [] }, [world])

  const { nodes: graphNodes, edges: graphEdges } = useMemo(() => {
    if (!world) return { nodes: [] as WNode[], edges: [] as WEdge[] }
    const nodes = [...base.nodes]
    const edges = [...base.edges]
    const seenN = new Set(nodes.map((n) => n.id))
    const seenE = new Set(edges.map((e) => e.id))
    for (const id of expanded) {
      const ext = buildExpansion(id, world, capCache.current, polCache.current)
      for (const n of ext.nodes) if (!seenN.has(n.id)) { seenN.add(n.id); nodes.push(n) }
      for (const e of ext.edges) if (!seenE.has(e.id)) { seenE.add(e.id); edges.push(e) }
    }
    return { nodes, edges }
  }, [world, base, expanded])

  const visibleNodes = useMemo(() => {
    const q = query.trim().toLowerCase()
    return graphNodes.filter((n) => !hiddenOntologies.has(n.ontology) && (!q || n.name.toLowerCase().includes(q)))
  }, [graphNodes, hiddenOntologies, query])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(() => graphEdges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)), [graphEdges, visibleIds])

  const nodesRef = useWorldSimulation(visibleNodes, visibleEdges)

  const toggleExpand = (id: string, expandable?: boolean) => {
    if (!expandable) return
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const selectNode = (id: string) => {
    setSelectedId((cur) => (cur === id ? null : id))
    const node = nodesRef.current.find((n) => n.id === id)
    if (node && node.x != null && node.y != null) {
      setTransform((t) => ({ scale: t.scale, x: dims.w / 2 - node.x! * t.scale, y: dims.h / 2 - node.y! * t.scale }))
    }
    if (!capCache.current.has(id) && world?.actors.some((a) => a.actor_id === id)) {
      fetchActorCapabilities(id).then((caps) => { capCache.current.set(id, caps.map((c) => c.name)); forceRerender((x) => x + 1) }).catch(() => {})
    }
    if (!polCache.current.has(id) && world?.societies.some((s) => s.society_id === id)) {
      fetchGovernancePolicies(id).then((pols) => { polCache.current.set(id, pols); forceRerender((x) => x + 1) }).catch(() => {})
    }
  }

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

  const counts = useMemo(() => {
    const c: Partial<Record<OntologyType, number>> = {}
    for (const n of graphNodes) c[n.ontology] = (c[n.ontology] ?? 0) + 1
    return c
  }, [graphNodes])

  const selectedNode = graphNodes.find((n) => n.id === selectedId) ?? null
  const neighborIds = useMemo(() => {
    const active = hoveredId ?? selectedId
    if (!active) return null
    const s = new Set<string>([active])
    for (const e of graphEdges) { if (e.source === active) s.add(e.target); if (e.target === active) s.add(e.source) }
    return s
  }, [hoveredId, selectedId, graphEdges])

  return (
    <div className="lwe-inspector lwe-agents-content lwe-kg-page">
      <div className="lwe-kg-heading">
        <div>
          <h2>World State Graph</h2>
          <p>Every entity currently in the Shared World — the live semantic state of MonkeyBrain, not one actor's relationships.</p>
        </div>
        {!loading && !error && <span className="lwe-kg-heading-meta">{graphNodes.length} entities · {graphEdges.length} predicates</span>}
      </div>

      {error && <div className="lwe-kg-error">⚠ {error}</div>}

      {!loading && !error && (
        <div className="lwe-kg-toolbar">
          <input aria-label="Search entities" className="lwe-kg-search" placeholder="Search the world…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="lwe-kg-filters">
            {(Object.keys(ONTOLOGY_META) as OntologyType[]).filter((k) => counts[k]).map((k) => (
              <button key={k} type="button" className={`lwe-kg-filter-chip${hiddenOntologies.has(k) ? ' is-off' : ''}`}
                style={{ '--chip-fg': ONTOLOGY_META[k].fg, '--chip-bg': ONTOLOGY_META[k].bg } as React.CSSProperties}
                onClick={() => setHiddenOntologies((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })}>
                {ONTOLOGY_PLURAL[k]} <span>{counts[k]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="lwe-agents-group lwe-kg-graph-card">
        <div className="lwe-kg-canvas" ref={canvasRef} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          {loading && <div className="lwe-kg-empty"><div className="lwe-kg-spinner" /><span>Assembling world state…</span></div>}
          {!loading && graphNodes.length === 0 && !error && <div className="lwe-kg-empty"><div className="lwe-kg-empty-icon">◈</div><span>No entities found in the world</span></div>}

          {!loading && graphNodes.length > 0 && (
            <svg className="lwe-kg-svg" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet">
              <defs>
                <marker id="kg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 Z" fill="#C7CDD9" /></marker>
                <filter id="kg-card-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.08" /></filter>
              </defs>
              <g className="lwe-kg-viewport" transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
                {visibleEdges.map((edge) => {
                  const sp = nodesRef.current.find((n) => n.id === edge.source)
                  const tp = nodesRef.current.find((n) => n.id === edge.target)
                  if (!sp || !tp || sp.x == null || tp.x == null) return null
                  const active = neighborIds ? neighborIds.has(edge.source) && neighborIds.has(edge.target) : false
                  const dimmed = neighborIds != null && !active
                  const color = PREDICATE_COLOR[edge.predicate] || '#D8DCE6'
                  const dx = tp.x! - sp.x!; const dy = tp.y! - sp.y!; const dist = Math.hypot(dx, dy) || 1
                  const ux = dx / dist; const uy = dy / dist
                  const srcR = Math.max(ONTOLOGY_META[sp.ontology].w, ONTOLOGY_META[sp.ontology].h) / 2
                  const tgtR = Math.max(ONTOLOGY_META[tp.ontology].w, ONTOLOGY_META[tp.ontology].h) / 2 + 6
                  const x1 = sp.x! + ux * srcR, y1 = sp.y! + uy * srcR, x2 = tp.x! - ux * tgtR, y2 = tp.y! - uy * tgtR
                  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
                  const bend = 18 * (edge.id.charCodeAt(0) % 2 === 0 ? 1 : -1)
                  const cx = mx + (-uy) * bend, cy = my + ux * bend
                  return (
                    <g key={edge.id} style={{ opacity: dimmed ? 0.12 : active ? 1 : 0.55 }}>
                      <path className="lwe-kg-edge" d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`} stroke={active ? color : '#D8DCE6'} markerEnd="url(#kg-arrow)" />
                      {active && <text x={cx} y={cy} textAnchor="middle" className="lwe-kg-edge-label" fill={color}>{edge.predicate}</text>}
                    </g>
                  )
                })}
                {visibleNodes.map((n) => {
                  const live = nodesRef.current.find((x) => x.id === n.id)
                  if (!live || live.x == null || live.y == null) return null
                  const meta = ONTOLOGY_META[n.ontology]
                  const isActive = neighborIds ? neighborIds.has(n.id) : true
                  const isSelected = selectedId === n.id
                  const isEntering = enteringIds.has(n.id)
                  return (
                    <g key={n.id} className={`lwe-kg-node${isSelected ? ' is-selected' : ''}${isEntering ? ' is-entering' : ''}`}
                      transform={`translate(${live.x},${live.y})`} style={{ opacity: isActive ? 1 : 0.3 }}
                      tabIndex={0} role="button" aria-label={`${n.name}, ${meta.label}, ${n.status}`}
                      onMouseEnter={() => setHoveredId(n.id)} onMouseLeave={() => setHoveredId(null)}
                      onClick={() => selectNode(n.id)}
                      onDoubleClick={(e) => { e.stopPropagation(); toggleExpand(n.id, n.expandable) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') selectNode(n.id); if (e.key === ' ') { e.preventDefault(); toggleExpand(n.id, n.expandable) } }}
                    >
                      <rect className="lwe-kg-node-card" x={-meta.w / 2} y={-meta.h / 2} width={meta.w} height={meta.h} rx={14}
                        fill="#FFFFFF" stroke={isSelected ? meta.fg : '#E8EAF0'} strokeWidth={isSelected ? 2 : 1} filter="url(#kg-card-shadow)" />
                      <g transform={`translate(${-meta.w / 2 + 12}, ${-8})`}><g transform="scale(0.68)" className="lwe-kg-node-icon" stroke={meta.fg}>{nodeIconPath(n.ontology, n.subtype)}</g></g>
                      <text className="lwe-kg-node-name" x={-meta.w / 2 + 38} y={-meta.h / 2 + 20}>{n.name.length > 18 ? `${n.name.slice(0, 17)}…` : n.name}</text>
                      <g transform={`translate(${-meta.w / 2 + 38}, ${-meta.h / 2 + 28})`}>
                        <rect width={Math.min(10 + meta.label.length * 5.6, meta.w - 50)} height={14} rx={7} fill={meta.bg} />
                        <text x={6} y={10} className="lwe-kg-node-badge" fill={meta.fg}>{meta.label}</text>
                      </g>
                      <circle className="lwe-kg-status-dot" cx={meta.w / 2 - 10} cy={-meta.h / 2 + 10} r={3.5}
                        fill={n.status === 'open' || n.status === 'active' || n.status === 'enabled' || n.status === 'in-stock' || n.status === 'existing' ? '#22C55E' : n.status === 'closed' || n.status === 'inactive' || n.status === 'out-of-stock' || n.status === 'disabled' ? '#EF4444' : '#94A3B8'} />
                      {n.expandable && <text className="lwe-kg-expand-hint" x={0} y={meta.h / 2 + 13} textAnchor="middle">{expanded.has(n.id) ? '− collapse' : '+ expand · dbl-click'}</text>}
                    </g>
                  )
                })}
              </g>
            </svg>
          )}
        </div>

        {selectedNode && (
          <aside className="lwe-kg-inspector">
            <div className="lwe-kg-inspector-header">
              <div>
                <span className="lwe-kg-inspector-badge" style={{ background: ONTOLOGY_META[selectedNode.ontology].bg, color: ONTOLOGY_META[selectedNode.ontology].fg }}>
                  {ONTOLOGY_META[selectedNode.ontology].label}
                </span>
                <h3>{selectedNode.name}</h3>
              </div>
              <button type="button" className="lwe-kg-inspector-close" onClick={() => setSelectedId(null)} aria-label="Close inspector">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="lwe-kg-inspector-body">
              <div className="lwe-kg-inspector-section">
                <div className="lwe-kg-inspector-section-title">Identity</div>
                <dl className="lwe-kg-inspector-fields">
                  <div><dt>Entity ID</dt><dd className="lwe-kg-mono">{selectedNode.id}</dd></div>
                  <div><dt>Ontology Class</dt><dd>{ONTOLOGY_META[selectedNode.ontology].label}</dd></div>
                  <div><dt>Subtype</dt><dd>{selectedNode.subtype}</dd></div>
                  <div><dt>Status</dt><dd>{selectedNode.status}</dd></div>
                </dl>
              </div>

              {selectedNode.ontology === 'human' || selectedNode.ontology === 'enterprise' ? (() => {
                const a = selectedNode.raw as Actor
                const merchant = world?.merchants.find((m) => m.owner_id === a.actor_id)
                return <>
                  <div className="lwe-kg-inspector-section">
                    <div className="lwe-kg-inspector-section-title">Runtime state</div>
                    <dl className="lwe-kg-inspector-fields">
                      <div><dt>Trust</dt><dd>{a.trust_level != null ? a.trust_level.toFixed(2) : '—'}</dd></div>
                      <div><dt>Memberships</dt><dd>{a.societies?.length ?? 0}</dd></div>
                      {merchant && <>
                        <div><dt>Open</dt><dd>{merchant.is_open ? 'Yes' : 'No'}</dd></div>
                        <div><dt>Hours</dt><dd>{merchant.hours || '—'}</dd></div>
                        <div><dt>Reputation</dt><dd>{merchant.reputation_rating != null ? `${merchant.reputation_rating}★ (${merchant.review_count ?? 0})` : '—'}</dd></div>
                        <div><dt>Delivery fee</dt><dd>{merchant.delivery_fee != null ? `$${merchant.delivery_fee.toFixed(2)}` : '—'}</dd></div>
                      </>}
                    </dl>
                  </div>
                  <button type="button" className="lwe-kg-expand-button" onClick={() => toggleExpand(selectedNode.id, true)}>
                    {expanded.has(selectedNode.id) ? 'Collapse goals / capabilities / inventory' : 'Expand goals / capabilities / inventory'}
                  </button>
                  {capCache.current.has(a.actor_id) && <div className="lwe-kg-inspector-section">
                    <div className="lwe-kg-inspector-section-title">Capabilities</div>
                    <div className="lwe-kg-chip-row">{(capCache.current.get(a.actor_id) ?? []).map((c) => <span key={c} className="lwe-kg-inline-chip">{c}</span>)}</div>
                  </div>}
                </>
              })() : null}

              {selectedNode.ontology === 'society' && (() => {
                const s = selectedNode.raw as Society
                return <>
                  <div className="lwe-kg-inspector-section">
                    <div className="lwe-kg-inspector-section-title">Runtime state</div>
                    <dl className="lwe-kg-inspector-fields">
                      <div><dt>Members</dt><dd>{s.actor_count ?? 0} ({s.active_actors ?? 0} active)</dd></div>
                      <div><dt>Type</dt><dd>{s.society_type || 'generic'}</dd></div>
                    </dl>
                  </div>
                  <button type="button" className="lwe-kg-expand-button" onClick={() => toggleExpand(selectedNode.id, true)}>
                    {expanded.has(selectedNode.id) ? 'Collapse policies' : 'Expand policies'}
                  </button>
                  {polCache.current.has(s.society_id) && <div className="lwe-kg-inspector-section">
                    <div className="lwe-kg-inspector-section-title">Policies</div>
                    <div className="lwe-kg-chip-row">{(polCache.current.get(s.society_id) ?? []).map((p) => <span key={p.policy_id} className="lwe-kg-inline-chip">{p.name}</span>)}</div>
                  </div>}
                </>
              })()}

              {selectedNode.ontology === 'product' && (() => {
                const p = selectedNode.raw as Product
                return <div className="lwe-kg-inspector-section">
                  <div className="lwe-kg-inspector-section-title">Runtime state</div>
                  <dl className="lwe-kg-inspector-fields">
                    <div><dt>Price</dt><dd className="lwe-kg-price">${p.price.toFixed(2)}</dd></div>
                    <div><dt>Quantity</dt><dd>{p.quantity}</dd></div>
                    <div><dt>Availability</dt><dd>{p.quantity > 0 ? 'In stock' : 'Out of stock'}</dd></div>
                  </dl>
                </div>
              })()}

              {selectedNode.ontology === 'geo' && (() => {
                const g = selectedNode.raw as GeoEntity
                return <div className="lwe-kg-inspector-section">
                  <div className="lwe-kg-inspector-section-title">Runtime state</div>
                  <dl className="lwe-kg-inspector-fields">
                    <div><dt>Children</dt><dd>{g.child_ids?.length ?? 0}</dd></div>
                    <div><dt>Hosted societies</dt><dd>{g.hosted_society_ids?.length ?? 0}</dd></div>
                  </dl>
                </div>
              })()}

              {selectedNode.ontology === 'policy' && (() => {
                const { policy } = selectedNode.raw as { policy: GovernancePolicy }
                return <div className="lwe-kg-inspector-section">
                  <div className="lwe-kg-inspector-section-title">Rules</div>
                  <ul className="lwe-kg-rules-list">{policy.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              })()}

              <div className="lwe-kg-inspector-section">
                <div className="lwe-kg-inspector-section-title">Relationships</div>
                <ul className="lwe-kg-relations-list">
                  {graphEdges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).slice(0, 20).map((e) => {
                    const otherId = e.source === selectedNode.id ? e.target : e.source
                    const other = graphNodes.find((n) => n.id === otherId)
                    const dir = e.source === selectedNode.id ? '→' : '←'
                    return <li key={e.id}><span className="lwe-kg-relation-predicate">{e.predicate}</span> {dir} {other?.name ?? otherId}</li>
                  })}
                </ul>
              </div>
              <div className="lwe-kg-inspector-updated">Live · updates every {REFRESH_MS / 1000}s</div>
            </div>
          </aside>
        )}
      </section>
    </div>
  )
}
