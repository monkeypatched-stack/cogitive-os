import { useEffect, useMemo, useRef, useState } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceCenter, type SimulationNodeDatum } from 'd3-force'
import type { RetrievedItemDto } from '../api/contextClient'
import type { DrawerContent } from './GroundingDetailDrawer'

export interface GNode extends SimulationNodeDatum {
  id: string
  label: string
  entityType: string
  content: string
  confidence: number
}
export interface GEdge { id: string; source: string; target: string; predicate: string }

const TYPE_COLOR: Record<string, string> = {
  person: '#1D4ED8', actor: '#1D4ED8', asset: '#047857', product: '#047857',
  organization: '#6D28D9', account: '#B45309', event: '#B91C1C',
  order: '#0891B2', warehouse: '#B45309', wallet: '#0D9488', agent: '#DB2777', store: '#6D28D9',
}
function colorFor(entityType: string): string {
  return TYPE_COLOR[entityType.toLowerCase()] ?? '#475569'
}

/** kernel/pipeline/planning/context_engine.py::_ranked_entities_and_
 * relationships writes knowledge items with evidence_ids=(entity_id,)
 * and relationship items with evidence_ids=(relationship_id, source_id,
 * target_id) — real, structured graph topology, not parsed from free
 * text. content is "{name} ({type}, id=..., ...)"; this only ever reads
 * the name/type prefix out of it, never invents a connection the
 * backend didn't already report. */
export function buildGraph(knowledge: RetrievedItemDto[], relationships: RetrievedItemDto[]): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = []
  const seen = new Set<string>()
  for (const item of knowledge) {
    const id = item.evidence_ids[0]
    if (!id || seen.has(id)) continue
    seen.add(id)
    const match = /^(.*?)\s*\((.*?),/.exec(item.content)
    nodes.push({
      id, label: match ? match[1] : item.content.slice(0, 24), entityType: match ? match[2] : 'entity',
      content: item.content, confidence: item.confidence,
    })
  }
  const edges: GEdge[] = []
  for (const item of relationships) {
    const [relId, sourceId, targetId] = item.evidence_ids
    if (!relId || !sourceId || !targetId || !seen.has(sourceId) || !seen.has(targetId)) continue
    const predMatch = /-\[(.+?)\]->/.exec(item.content)
    edges.push({ id: relId, source: sourceId, target: targetId, predicate: predMatch ? predMatch[1] : 'related_to' })
  }
  return { nodes, edges }
}

export function GroundingKnowledgeGraphCard({
  knowledge, relationships, onOpenDetail, onViewGraph, highlightedRelationshipId,
}: {
  knowledge: RetrievedItemDto[]
  relationships: RetrievedItemDto[]
  onOpenDetail: (content: DrawerContent) => void
  onViewGraph: () => void
  // Driven by the separate Relationships card: clicking a relationship
  // row there highlights its edge here, without either card owning the
  // other's state.
  highlightedRelationshipId?: string | null
}) {
  const { nodes, edges } = useMemo(() => buildGraph(knowledge, relationships), [knowledge, relationships])
  const [, bump] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<GNode[]>([])
  const [dims, setDims] = useState({ w: 400, h: 220 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  // Persists after the mouse leaves — "when a node is selected, visually
  // highlight its connected relationships" (hover alone is transient).
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const dragging = useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 })

  useEffect(() => {
    if (!wrapRef.current) return
    const obs = new ResizeObserver(([e]) => { if (e) setDims({ w: e.contentRect.width, h: e.contentRect.height }) })
    obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const simNodes: GNode[] = nodes.map((n) => ({ ...n, x: dims.w / 2 + (Math.random() - 0.5) * 80, y: dims.h / 2 + (Math.random() - 0.5) * 80 }))
    const idIndex = new Set(simNodes.map((n) => n.id))
    const simLinks = edges.filter((e) => idIndex.has(e.source) && idIndex.has(e.target)).map((e) => ({ ...e }))
    const sim = forceSimulation(simNodes)
      .force('link', forceLink(simLinks).id((d) => (d as GNode).id).distance(52).strength(0.5))
      .force('charge', forceManyBody().strength(-90))
      .force('collide', forceCollide<GNode>().radius(20))
      .force('center', forceCenter(dims.w / 2, dims.h / 2))
      .alpha(0.9)
      .on('tick', () => bump((t) => t + 1))
    nodesRef.current = simNodes
    return () => { sim.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, dims.w, dims.h])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setTransform((t) => ({ ...t, scale: Math.min(2.5, Math.max(0.4, t.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08))) }))
  }
  const onMouseDown = (e: React.MouseEvent) => { dragging.current = { active: true, lastX: e.clientX, lastY: e.clientY } }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current.active) return
    const dx = e.clientX - dragging.current.lastX, dy = e.clientY - dragging.current.lastY
    dragging.current.lastX = e.clientX; dragging.current.lastY = e.clientY
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }
  const onMouseUp = () => { dragging.current.active = false }

  const focusId = hoverId ?? selectedId
  const neighborIds = useMemo(() => {
    if (!focusId) return null
    const s = new Set<string>([focusId])
    for (const e of edges) { if (e.source === focusId) s.add(e.target); if (e.target === focusId) s.add(e.source) }
    return s
  }, [focusId, edges])

  const openNode = (n: GNode) => {
    setSelectedId((current) => (current === n.id ? null : n.id))
    const connected = edges.filter((e) => e.source === n.id || e.target === n.id)
    onOpenDetail({
      title: n.label,
      subtitle: `Knowledge graph entity · ${n.entityType}`,
      fields: [
        { label: 'Entity ID', value: n.id, mono: true },
        { label: 'Type', value: n.entityType },
        { label: 'Confidence', value: n.confidence.toFixed(2) },
        { label: 'Full record', value: n.content },
      ],
      list: connected.map((e) => ({
        primary: `${e.source === n.id ? '→' : '←'} ${e.predicate}`,
        secondary: e.source === n.id ? e.target : e.source,
      })),
      listLabel: 'Relationships',
    })
  }

  if (nodes.length === 0) {
    return <div className="lwe-gd-card-empty">No knowledge graph entities retrieved for this execution.</div>
  }

  return (
    <div ref={wrapRef} className="lwe-gd-graph-wrap">
      <svg
        className="lwe-gd-graph-svg" onWheel={onWheel}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        role="img" aria-label="Knowledge graph retrieved for this execution"
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
          {edges.map((e) => {
            const s = nodesRef.current.find((n) => n.id === e.source)
            const t = nodesRef.current.find((n) => n.id === e.target)
            if (!s || !t || s.x == null || t.x == null) return null
            const active = (neighborIds ? neighborIds.has(e.source) && neighborIds.has(e.target) : false) || e.id === highlightedRelationshipId
            return <line key={e.id} className={`lwe-gd-graph-edge${active ? ' active' : ''}`} x1={s.x} y1={s.y!} x2={t.x} y2={t.y!} />
          })}
          {nodesRef.current.map((n) => {
            if (n.x == null || n.y == null) return null
            const highlightedEdge = edges.find((e) => e.id === highlightedRelationshipId)
            const inHighlightedEdge = highlightedEdge != null && (n.id === highlightedEdge.source || n.id === highlightedEdge.target)
            const dim = neighborIds != null ? !neighborIds.has(n.id) : (highlightedEdge != null && !inHighlightedEdge)
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ opacity: dim ? 0.25 : 1, cursor: 'pointer' }}
                onMouseEnter={() => setHoverId(n.id)} onMouseLeave={() => setHoverId(null)}
                onClick={() => openNode(n)}>
                {n.id === selectedId && <circle r={13} fill="none" stroke={colorFor(n.entityType)} strokeWidth={2} opacity={0.45} />}
                <circle r={9} fill={colorFor(n.entityType)} stroke="#fff" strokeWidth={2} />
                <text className="lwe-gd-graph-node-label" x={12} y={4}>{n.label.length > 16 ? `${n.label.slice(0, 15)}…` : n.label}</text>
              </g>
            )
          })}
        </g>
      </svg>
      <div className="lwe-gd-graph-hint">scroll to zoom · drag to pan</div>
      <button type="button" className="lwe-gd-card-action" style={{ position: 'absolute', top: 8, right: 8 }} onClick={onViewGraph}>View Graph</button>
    </div>
  )
}
