import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, type SimulationNodeDatum } from 'd3-force'
import {
  fetchSomaticChartsSummary, fetchSomaticCapabilities, fetchSomaticPrompts,
  type SomaticChartsSummary, type SomaticCapabilitiesSummary, type SomaticPrompt,
} from '../api/sittingfaceClient'
import './SittingFacePanel.css'

interface Data {
  charts: SomaticChartsSummary
  caps: SomaticCapabilitiesSummary
  prompts: SomaticPrompt[]
}

// ── Relationship graph model ────────────────────────────────────────────
// Real edges only, both sourced directly from SomaticCompiler's own
// resolution logic (see sittingface.py route comments):
//   capability-type Chart --REGISTERS_AS--> Capability   (chart.values.capability.name)
//   module-type Chart     --COMPILES_TO-->  Prompt        (prompt.chart_name)
// Agent-type charts and the 11 capabilities with no chart source get real
// nodes but no fabricated edges — the compiler itself tracks no
// relationship for them (agents register through broca separately).
type SfKind = 'chart-module' | 'chart-capability' | 'chart-agent' | 'capability' | 'prompt'

interface SfNode extends SimulationNodeDatum {
  id: string
  kind: SfKind
  label: string
}
interface SfEdge { id: string; source: string; target: string; predicate: string }

const KIND_META: Record<SfKind, { label: string; fg: string; bg: string }> = {
  'chart-module':     { label: 'Module chart',     fg: '#1D4ED8', bg: '#EFF6FF' },
  'chart-capability': { label: 'Capability chart',  fg: '#B45309', bg: '#FFFBEB' },
  'chart-agent':      { label: 'Agent chart',       fg: '#7C3AED', bg: '#F5F3FF' },
  capability:         { label: 'Capability',        fg: '#15803D', bg: '#F0FDF4' },
  prompt:             { label: 'Prompt',            fg: '#BE123C', bg: '#FFF1F2' },
}
const ANCHORS: Record<SfKind, { x: number; y: number }> = {
  'chart-module': { x: 260, y: 220 }, 'chart-capability': { x: 700, y: 160 }, 'chart-agent': { x: 1100, y: 220 },
  capability: { x: 700, y: 520 }, prompt: { x: 260, y: 520 },
}

function buildSfGraph(data: Data): { nodes: SfNode[]; edges: SfEdge[] } {
  const nodes: SfNode[] = []
  const edges: SfEdge[] = []
  const seen = new Set<string>()
  const addNode = (id: string, kind: SfKind, label: string) => { if (!seen.has(id)) { seen.add(id); nodes.push({ id, kind, label }) } }

  for (const c of data.charts.charts) addNode(`chart:${c.name}`, `chart-${c.chart_type}` as SfKind, c.name)
  for (const capName of data.caps.capabilities) addNode(`cap:${capName}`, 'capability', capName)
  for (const p of data.prompts) addNode(`prompt:${p.chart}`, 'prompt', `Prompt: ${p.chart}`)

  for (const link of data.caps.chart_capabilities) {
    const source = `chart:${link.chart}`, target = `cap:${link.capability_name}`
    if (seen.has(source) && seen.has(target)) edges.push({ id: `${source}->${target}`, source, target, predicate: 'REGISTERS_AS' })
  }
  for (const p of data.prompts) {
    const source = `chart:${p.chart}`, target = `prompt:${p.chart}`
    if (seen.has(source) && seen.has(target)) edges.push({ id: `${source}->${target}`, source, target, predicate: 'COMPILES_TO' })
  }
  return { nodes, edges }
}

function useSfSimulation(nodes: SfNode[], edges: SfEdge[]) {
  const [, bump] = useState(0)
  const nodesRef = useRef<SfNode[]>([])
  const simRef = useRef<ReturnType<typeof forceSimulation<SfNode>> | null>(null)
  const signature = useMemo(() => `${nodes.length}|${edges.length}`, [nodes, edges])

  useEffect(() => {
    const simNodes: SfNode[] = nodes.map((n) => {
      const anchor = ANCHORS[n.kind]
      return { ...n, x: anchor.x + (Math.random() - 0.5) * 80, y: anchor.y + (Math.random() - 0.5) * 80 }
    })
    const idIndex = new Map(simNodes.map((n) => [n.id, n]))
    const simLinks = edges.filter((e) => idIndex.has(e.source) && idIndex.has(e.target)).map((e) => ({ ...e }))
    simRef.current?.stop()
    const sim = forceSimulation(simNodes)
      .force('link', forceLink(simLinks).id((d) => (d as SfNode).id).distance(46).strength(0.3))
      .force('charge', forceManyBody().strength(-40))
      .force('collide', forceCollide<SfNode>().radius(16))
      .force('x', forceX<SfNode>((d) => ANCHORS[d.kind].x).strength(0.045))
      .force('y', forceY<SfNode>((d) => ANCHORS[d.kind].y).strength(0.045))
      .alpha(0.8)
      .on('tick', () => bump((t) => t + 1))
    simRef.current = sim
    nodesRef.current = simNodes
    return () => { sim.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return nodesRef
}

/** Collection-level view of SittingFace, the real external knowledge base
 * (src/sittingface), plus a real relationship graph between its charts,
 * capabilities, and prompts — the two REGISTERS_AS/COMPILES_TO edges the
 * compiler itself actually resolves, nothing fabricated. */
export function SittingFacePanel() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [dims, setDims] = useState({ w: 900, h: 620 })
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchSomaticChartsSummary(), fetchSomaticCapabilities(), fetchSomaticPrompts()])
      .then(([charts, caps, prompts]) => {
        if (cancelled) return
        setData({ charts, caps, prompts })
        setError('')
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!canvasRef.current) return
    const obs = new ResizeObserver(([e]) => { if (e) setDims({ w: e.contentRect.width, h: Math.max(420, e.contentRect.height) }) })
    obs.observe(canvasRef.current)
    return () => obs.disconnect()
  }, [])

  const { nodes, edges } = useMemo(() => data ? buildSfGraph(data) : { nodes: [] as SfNode[], edges: [] as SfEdge[] }, [data])
  const nodesRef = useSfSimulation(nodes, edges)

  const neighborIds = useMemo(() => {
    if (!hoveredId) return null
    const s = new Set<string>([hoveredId])
    for (const e of edges) { if (e.source === hoveredId) s.add(e.target); if (e.target === hoveredId) s.add(e.source) }
    return s
  }, [hoveredId, edges])

  const onWheel = useCallback((_e: React.WheelEvent) => {}, [])

  const kindCounts = useMemo(() => { const c: Partial<Record<SfKind, number>> = {}; for (const n of nodes) c[n.kind] = (c[n.kind] ?? 0) + 1; return c }, [nodes])

  return (
    <div className="lwe-inspector lwe-agents-content lwe-sf-page">
      <div className="lwe-sf-heading">
        <div>
          <h2>Knowledge Graph</h2>
          <p>SittingFace — the real external knowledge base MonkeyBrain draws on.</p>
        </div>
      </div>

      {loading && <div className="lwe-sf-empty"><div className="lwe-sf-spinner" /><span>Loading SittingFace…</span></div>}
      {error && <div className="lwe-sf-error">⚠ Unable to reach SittingFace: {error}</div>}

      {!loading && !error && data && <>
        <div className="lwe-sf-cards">
          <div className="lwe-sf-card">
            <div className="lwe-sf-card-label">Charts</div>
            <div className="lwe-sf-card-value">{data.charts.total_charts}</div>
            <div className="lwe-sf-card-breakdown">
              <span><strong>{data.charts.by_type.module}</strong> module</span>
              <span><strong>{data.charts.by_type.capability}</strong> capability</span>
              <span><strong>{data.charts.by_type.agent}</strong> agent</span>
            </div>
          </div>
          <div className="lwe-sf-card">
            <div className="lwe-sf-card-label">Capabilities</div>
            <div className="lwe-sf-card-value">{data.caps.capabilities.length}</div>
            <div className="lwe-sf-card-breakdown">
              <span><strong>{data.caps.chart_capabilities.length}</strong> from charts</span>
              <span><strong>{data.caps.capabilities.length - data.caps.chart_capabilities.length}</strong> other</span>
            </div>
          </div>
          <div className="lwe-sf-card">
            <div className="lwe-sf-card-label">Prompts</div>
            <div className="lwe-sf-card-value">{data.prompts.length}</div>
            <div className="lwe-sf-card-breakdown">
              <span><strong>{data.charts.prompts_compiled}</strong> compiled at boot</span>
            </div>
          </div>
        </div>

        <div className="lwe-sf-graph-heading">
          <h3>Relationships between SittingFace nodes</h3>
          <div className="lwe-sf-legend">
            {(Object.keys(KIND_META) as SfKind[]).filter((k) => kindCounts[k]).map((k) => (
              <span key={k} className="lwe-sf-legend-chip" style={{ background: KIND_META[k].bg, color: KIND_META[k].fg }}>{KIND_META[k].label} <b>{kindCounts[k]}</b></span>
            ))}
            <span className="lwe-sf-legend-edge-hint">REGISTERS_AS · COMPILES_TO — hover a node to trace its real edges</span>
          </div>
        </div>

        <div className="lwe-sf-graph-card" ref={canvasRef} onWheel={onWheel}>
          <svg className="lwe-sf-svg" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet">
            <defs>
              <marker id="sf-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 Z" fill="#C7CDD9" /></marker>
            </defs>
            {edges.map((e) => {
              const sp = nodesRef.current.find((n) => n.id === e.source)
              const tp = nodesRef.current.find((n) => n.id === e.target)
              if (!sp || !tp || sp.x == null || tp.x == null) return null
              const active = neighborIds ? neighborIds.has(e.source) && neighborIds.has(e.target) : false
              const dimmed = neighborIds != null && !active
              return <line key={e.id} className="lwe-sf-edge" x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                style={{ opacity: dimmed ? 0.06 : active ? 0.9 : 0.25 }} markerEnd="url(#sf-arrow)" />
            })}
            {nodes.map((n) => {
              const live = nodesRef.current.find((x) => x.id === n.id)
              if (!live || live.x == null || live.y == null) return null
              const meta = KIND_META[n.kind]
              const isActive = neighborIds ? neighborIds.has(n.id) : true
              return (
                <g key={n.id} transform={`translate(${live.x},${live.y})`} style={{ opacity: isActive ? 1 : 0.15 }}
                  onMouseEnter={() => setHoveredId(n.id)} onMouseLeave={() => setHoveredId(null)}>
                  <circle r={hoveredId === n.id ? 7 : 5} fill={meta.bg} stroke={meta.fg} strokeWidth={1.4} />
                  {hoveredId === n.id && <text className="lwe-sf-node-label" x={9} y={4}>{n.label}</text>}
                </g>
              )
            })}
          </svg>
        </div>
        <div className="lwe-sf-hint">Nodes are individual charts/capabilities/prompts (real names); the cards above stay collection-level. Only two real, compiler-verified predicates connect them — no relationship is inferred or guessed.</div>
      </>}
    </div>
  )
}
