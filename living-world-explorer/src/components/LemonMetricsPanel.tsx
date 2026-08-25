import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useRefreshStore } from '../store/refreshStore'
import {
  fetchObservabilitySnapshot, parseCounterKey, sumHistogramPrefix,
  type ObservabilitySnapshot,
} from '../api/communicationClient'
import { ArchitectureDiagram } from './ArchitectureDiagram'
import './LemonMetricsPanel.css'

// Lemon Metrics — every counter/gauge/histogram the runtime actually
// exports via GET /observability, charted rather than left as plain
// number cards. The curated sections below (Executions/Planning/LLM/
// Capabilities/Reliability) give the metrics with real cross-value meaning
// (success vs failure, latency percentiles) their own purpose-built chart
// form; "usedKeys" tracks exactly which raw keys those sections already
// rendered so the auto-generated "All Metrics" section below can show
// every remaining real key, grouped by namespace, with nothing duplicated
// and nothing hidden. A metric with no data is simply absent — never a
// fabricated zero bar.

type Segment = 'accent' | 'success' | 'danger' | 'warning'
type HistStats = { count: number; min?: number; max?: number; avg?: number; p50?: number; p95?: number; p99?: number }

function fmtMs(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—'
  if (v < 1) return `${v.toFixed(2)}ms`
  if (v < 1000) return `${v.toFixed(1)}ms`
  return `${(v / 1000).toFixed(2)}s`
}
function fmtNum(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
function fmtPct(v: number): string { return `${v.toFixed(1)}%` }
// Heuristic only for the auto-discovered "All Metrics" section, where the
// metric's real unit isn't known ahead of time the way the curated
// sections' hand-picked keys are.
function fmtAuto(name: string, v: number): string {
  return /_ms\b|latency_ms|duration_ms|tick_total_ms/i.test(name) ? fmtMs(v) : fmtNum(v)
}

interface Row { key: string; label: string; sub?: string; value: number }

function BarList({ rows, color = 'accent', format }: { rows: Row[]; color?: Segment; format?: (r: Row) => string }) {
  if (rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.value), 1)
  return <div className="lwe-lm-barlist">
    {rows.map((r) => {
      const pct = max > 0 ? Math.max((r.value / max) * 100, r.value > 0 ? 2.5 : 0) : 0
      return <div className="lwe-lm-bar-row" key={r.key} title={`${r.label}${r.sub ? ` (${r.sub})` : ''}: ${format ? format(r) : fmtNum(r.value)}`}>
        <div>
          <div className="lwe-lm-bar-label">{r.label}</div>
          {r.sub && <span className="lwe-lm-bar-sub">{r.sub}</span>}
        </div>
        <div className="lwe-lm-bar-track"><div className={`lwe-lm-bar-fill lwe-lm-bar-${color}`} style={{ width: `${pct}%` }} /></div>
        <div className="lwe-lm-bar-value">{format ? format(r) : fmtNum(r.value)}</div>
      </div>
    })}
  </div>
}

interface SplitRow { key: string; label: string; segments: { name: string; value: number; color: Segment }[] }

function SplitList({ rows }: { rows: SplitRow[] }) {
  if (rows.length === 0) return null
  const seenNames = new Map<string, Segment>()
  for (const row of rows) for (const seg of row.segments) if (!seenNames.has(seg.name)) seenNames.set(seg.name, seg.color)
  return <div className="lwe-lm-barlist">
    <div className="lwe-lm-legend">
      {[...seenNames.entries()].map(([name, color]) => <span className="lwe-lm-legend-item" key={name}><i className={`lwe-lm-dot lwe-lm-bar-${color}`} />{name}</span>)}
    </div>
    {rows.map((row) => {
      const total = row.segments.reduce((s, seg) => s + seg.value, 0)
      return <div className="lwe-lm-split-row" key={row.key} title={row.label}>
        <div className="lwe-lm-bar-label">{row.label}</div>
        {total === 0
          ? <div className="lwe-lm-split-empty">No data</div>
          : <div className="lwe-lm-split-track">
            {row.segments.filter((s) => s.value > 0).map((s) => <div
              key={s.name} className={`lwe-lm-split-fill lwe-lm-bar-${s.color}`}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.name}: ${fmtNum(s.value)} (${Math.round((s.value / total) * 1000) / 10}%)`}
            />)}
          </div>}
      </div>
    })}
  </div>
}

interface HistRow { key: string; label: string; sub?: string; stats: HistStats }

function HistogramList({ rows }: { rows: HistRow[] }) {
  if (rows.length === 0) return null
  return <div className="lwe-lm-barlist">
    <div className="lwe-lm-hist-legend"><b>|</b> p50 &nbsp; <b style={{ color: '#B91C1C' }}>|</b> p95 &nbsp; band = min→max</div>
    {rows.map(({ key, label, sub, stats }) => {
      const min = stats.min ?? 0, max = stats.max ?? 0, p50 = stats.p50 ?? 0, p95 = stats.p95 ?? 0, p99 = stats.p99 ?? 0
      const span = Math.max(max - min, 0.0001)
      const pos = (v: number) => Math.min(100, Math.max(0, ((v - min) / span) * 100))
      return <div className="lwe-lm-hist-row" key={key} title={`n=${stats.count} · min ${fmtMs(min)} · p50 ${fmtMs(p50)} · p95 ${fmtMs(p95)} · p99 ${fmtMs(p99)} · max ${fmtMs(max)}`}>
        <div>
          <div className="lwe-lm-bar-label">{label}</div>
          {sub && <span className="lwe-lm-bar-sub">{sub}</span>}
        </div>
        <div className="lwe-lm-hist-track">
          <div className="lwe-lm-hist-range" />
          <div className="lwe-lm-hist-p50" style={{ left: `${pos(p50)}%` }} />
          <div className="lwe-lm-hist-p95" style={{ left: `${pos(p95)}%` }} />
        </div>
        <div className="lwe-lm-hist-value">p50 {fmtMs(p50)} · p95 {fmtMs(p95)}</div>
      </div>
    })}
  </div>
}

// ── Meter: a single ratio against a limit. Fill carries severity; the
// unfilled track is a lighter step of that SAME hue (not neutral gray), so
// state reads across the whole bar at a glance — good/warn/critical use
// the app's existing chip hexes (NegotiationsPanel.css / CommunicationPanel
// .css), not new colors. ──────────────────────────────────────────────
const SEVERITY_COLORS = {
  good: { fill: '#047857', track: '#ECFDF5' },
  warn: { fill: '#92400E', track: '#FFFBEB' },
  critical: { fill: '#B91C1C', track: '#FEF2F2' },
} as const

function Meter({ label, value, format = fmtPct, goodAt = 95, warnAt = 80 }: {
  label: string; value: number | null; format?: (v: number) => string; goodAt?: number; warnAt?: number
}) {
  if (value === null || Number.isNaN(value)) return null
  const severity = value >= goodAt ? 'good' : value >= warnAt ? 'warn' : 'critical'
  const colors = SEVERITY_COLORS[severity]
  const pct = Math.max(0, Math.min(100, value))
  return <div className="lwe-lm-meter-row" title={`${label}: ${format(value)}`}>
    <div className="lwe-lm-bar-label">{label}</div>
    <div className="lwe-lm-meter-track" style={{ background: colors.track }}>
      <div className="lwe-lm-meter-fill" style={{ width: `${pct}%`, background: colors.fill }} />
    </div>
    <div className="lwe-lm-meter-value" style={{ color: colors.fill }}>{format(value)}</div>
  </div>
}

interface Point { t: number; v: number }

// ── Sparkline: a real trend line built from samples this panel itself
// observed while open (the runtime only exports a live snapshot, no
// server-side history) — never fabricated, just genuinely thin on history
// right after the page opens. Interactive per dataviz's line-chart
// contract: a crosshair tracks the pointer and snaps to the nearest
// sample; the end-dot carries a surface ring so it stays legible where it
// meets the line. Single series, so no legend box (the section header
// already names it). ────────────────────────────────────────────────────
function Sparkline({ points, color = '#4338CA', format = fmtNum }: { points: Point[]; color?: string; format?: (v: number) => string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const width = 560, height = 64
  if (points.length < 2) return <div className="lwe-lm-spark-empty">Collecting live trend…</div>

  const values = points.map((p) => p.v)
  const min = Math.min(...values), max = Math.max(...values)
  const span = Math.max(max - min, max * 0.02, 0.0001)
  const padY = 8
  const x = (i: number) => (i / (points.length - 1)) * width
  const y = (v: number) => height - padY - ((v - min) / span) * (height - padY * 2)
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${height} L 0 ${height} Z`

  const handleMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * width
    const idx = Math.round((relX / width) * (points.length - 1))
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)))
  }

  const activeIdx = hoverIdx ?? points.length - 1
  const active = points[activeIdx]
  const isLive = hoverIdx === null

  return <div className="lwe-lm-spark-wrap">
    <svg viewBox={`0 0 ${width} ${height}`} className="lwe-lm-spark-svg" preserveAspectRatio="none"
      onPointerMove={handleMove} onPointerLeave={() => setHoverIdx(null)} role="img" aria-label={`Trend, latest value ${format(values[values.length - 1])}`}>
      <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {hoverIdx !== null && <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={0} y2={height} className="lwe-lm-spark-crosshair" />}
      <circle cx={x(activeIdx)} cy={y(active.v)} r={4} fill={color} stroke="#FFFFFF" strokeWidth={2} />
    </svg>
    <div className="lwe-lm-spark-readout">
      <span className="lwe-lm-spark-value">{format(active.v)}</span>
      <span className="lwe-lm-spark-time">{isLive ? 'latest' : new Date(active.t).toLocaleTimeString()}</span>
    </div>
  </div>
}

// ── MiniSparkline: the compact, non-interactive trend a stat tile carries
// (dataviz's stat-tile contract — "12-point sparkline in the de-emphasis
// hue, current period in the accent"). Not a standalone chart, so no
// crosshair of its own; the tile's own current value is the readout.
function MiniSparkline({ points, color = '#4338CA' }: { points: Point[]; color?: string }) {
  const width = 160, height = 28
  if (points.length < 2) return null
  const values = points.map((p) => p.v)
  const min = Math.min(...values), max = Math.max(...values)
  const span = Math.max(max - min, max * 0.02, 0.0001)
  const x = (i: number) => (i / (points.length - 1)) * width
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  return <svg viewBox={`0 0 ${width} ${height}`} className="lwe-lm-mini-spark" preserveAspectRatio="none" aria-hidden="true">
    <path d={path} fill="none" stroke="#CBD5E1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={x(points.length - 1)} cy={y(last.v)} r={4} fill={color} stroke="#FFFFFF" strokeWidth={2} />
  </svg>
}

// ── Stat tile: "a single current value (+ maybe a trend)" — the correct
// form for a lone gauge, per dataviz's own table (never a one-bar bar
// chart for this job).
function StatTile({ label, value, format = fmtNum, points, color = '#4338CA' }: {
  label: string; value: number | null; format?: (v: number) => string; points: Point[]; color?: string
}) {
  if (value === null) return null
  return <div className="lwe-lm-stat" title={`${label}: ${format(value)}`}>
    <div className="lwe-lm-stat-head">
      <span className="lwe-lm-bar-label">{label}</span>
      <span className="lwe-lm-stat-value">{format(value)}</span>
    </div>
    {points.length >= 2 ? <MiniSparkline points={points} color={color} /> : <div className="lwe-lm-spark-empty">Collecting live trend…</div>}
  </div>
}

function Section({ title, description, count, children }: { title: string; description?: string; count?: number; children: ReactNode }) {
  return <div className="lwe-lm-section">
    <div className="lwe-lm-section-head">
      <h3>{title}</h3>
      {count !== undefined && <span className="lwe-lm-section-count">{count}</span>}
    </div>
    <div className="lwe-lm-section-body">
      {description && <p style={{ margin: '-4px 0 0', fontSize: 11.5, color: '#64748B' }}>{description}</p>}
      {children}
    </div>
  </div>
}

// ── Pipeline Stages: every real cognitive-tick stage (including Predict/
// TransitionGate/Compare/Learn, which have no curated section of their
// own above), one collapsible drawer each — the telemetry-side companion
// to ArchitectureDiagram's static structure view. 'metric': a real code
// path exists (shows real values, or "no data yet" if this session's
// snapshot hasn't produced any). 'not_instrumented': the code path
// genuinely emits nothing anywhere in the kernel — a structural gap, not
// a quiet session. 'decorative': not a metered stage at all.
export type StageKind = 'metric' | 'not_instrumented' | 'decorative'
export interface StageMetric { label: string; value: string }
export interface Stage { id: string; title: string; metrics: StageMetric[]; kind?: StageKind; note?: string }

function StageDrawer({ stage }: { stage: Stage }) {
  const kind: StageKind = stage.kind ?? 'metric'
  const hasData = stage.metrics.length > 0
  const badge = kind === 'decorative' ? null : hasData ? 'has data' : kind === 'not_instrumented' ? 'not instrumented' : 'no data yet'
  const badgeClass = !hasData && kind === 'not_instrumented' ? 'lwe-lm-stage-badge-gap' : hasData ? 'lwe-lm-stage-badge-data' : 'lwe-lm-stage-badge-quiet'
  return <details className="lwe-lm-group">
    <summary>
      {stage.title}
      {badge && <span className={`lwe-lm-stage-badge ${badgeClass}`}>{badge}</span>}
    </summary>
    <div className="lwe-lm-group-body">
      {stage.note && <p style={{ margin: '0 0 8px', fontSize: 11, color: '#94A3B8' }}>{stage.note}</p>}
      {hasData
        ? <div className="lwe-lm-stage-metrics">
            {stage.metrics.map((m) => <div className="lwe-lm-stage-metric" key={m.label}>
              <span className="lwe-lm-bar-label">{m.label}</span>
              <span className="lwe-lm-stage-metric-value">{m.value}</span>
            </div>)}
          </div>
        : kind !== 'decorative' && <div className={`lwe-lm-split-empty${kind === 'not_instrumented' ? ' lwe-lm-stage-nodata-strong' : ''}`}>
            {kind === 'not_instrumented' ? 'Not instrumented — no counter/gauge/histogram emitted anywhere for this stage.' : 'Instrumented, but this session has not emitted a value yet.'}
          </div>}
    </div>
  </details>
}

const STAGE_ORDER = [
  'goal', 'world_state', 'observe', 'believe', 'plan', 'predict', 'decide', 'execute',
  'transition_gate', 'negotiation', 'commit', 'observe_outcome', 'compare', 'learn', 'learn_transitions',
] as const

function PipelineStages({ stages }: { stages: Record<string, Stage> }) {
  return <div className="lwe-lm-all">
    {STAGE_ORDER.map((id) => {
      const stage = stages[id]
      return stage ? <StageDrawer key={id} stage={stage} /> : null
    })}
  </div>
}

function splitKey(key: string): { name: string; sub: string } {
  const { name, tags } = parseCounterKey(key)
  const sub = Object.entries(tags).map(([k, v]) => {
    const shortV = /^[0-9a-f]{16,}$/i.test(v) ? `${v.slice(0, 8)}…` : v
    return `${k}=${shortV}`
  }).join(' · ')
  return { name: name.replace(/_/g, ' ').replace(/\./g, ' › '), sub }
}

function namespaceOf(key: string): string {
  return (key.split(':')[0].split('.')[0] || 'other')
}

const NAMESPACE_LABELS: Record<string, string> = {
  execution: 'Execution', execution_graph: 'Execution Graph', plan: 'Plan', llm: 'LLM',
  capability: 'Capability', grounding: 'Grounding', communication: 'Communication',
  coordination: 'Coordination', cognitive: 'Cognitive', pipeline: 'Pipeline', context: 'Context',
  narrative: 'Narrative', api: 'API', intent: 'Intent', audit: 'Audit', idempotency: 'Idempotency',
}
function namespaceLabel(ns: string): string {
  return NAMESPACE_LABELS[ns] ?? ns.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

// Sums every counter matching name+groupTag, split out per groupTag value
// and further broken down by seriesTag — e.g. every capability.calls.total
// entry, grouped by which capability it's for, broken into success/failed/
// blocked/rejected counts for that capability.
function breakdownByTag(
  counters: Record<string, number> | undefined, name: string, groupTag: string, seriesTag: string,
): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>()
  if (!counters) return out
  for (const [key, value] of Object.entries(counters)) {
    const parsed = parseCounterKey(key)
    if (parsed.name !== name) continue
    const groupVal = parsed.tags[groupTag]
    if (!groupVal) continue
    const seriesVal = parsed.tags[seriesTag] ?? 'unknown'
    const bucket = out.get(groupVal) ?? {}
    bucket[seriesVal] = (bucket[seriesVal] ?? 0) + value
    out.set(groupVal, bucket)
  }
  return out
}

const HISTORY_LIMIT = 40
const HISTORY_POLL_MS = 5000

export function LemonMetricsPanel() {
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)
  const [snapshot, setSnapshot] = useState<ObservabilitySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Client-observed rolling history — the runtime only exports a live
  // snapshot (no server-side time series), so every sparkline/trend on
  // this page is built from samples actually seen while it's been open,
  // never fabricated. Real React state (not a ref) so a new sample
  // re-renders the trend charts.
  const [history, setHistory] = useState<Map<string, Point[]>>(new Map())

  const recordHistory = useCallback((snap: ObservabilitySnapshot) => {
    setHistory((prev) => {
      const next = new Map(prev)
      const t = Date.now()
      const push = (key: string, v: number | undefined | null) => {
        if (v === undefined || v === null || Number.isNaN(v)) return
        const arr = [...(next.get(key) ?? []), { t, v }]
        if (arr.length > HISTORY_LIMIT) arr.splice(0, arr.length - HISTORY_LIMIT)
        next.set(key, arr)
      }
      for (const [k, v] of Object.entries(snap.metrics?.gauges ?? {})) push(k, v)
      const histBag = snap.metrics?.histograms
      push('trend:execution.duration_ms:p95', sumHistogramPrefix(histBag, 'execution.duration_ms')?.p95)
      push('trend:llm.call.duration_ms:p95', sumHistogramPrefix(histBag, 'llm.call.duration_ms')?.p95)
      push('trend:capability.duration_ms:p95', sumHistogramPrefix(histBag, 'capability.duration_ms')?.p95)
      return next
    })
  }, [])

  const load = useCallback((background: boolean) => {
    if (!background) setLoading(true)
    setError('')
    fetchObservabilitySnapshot()
      .then((snap) => { setSnapshot(snap); recordHistory(snap) })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => { if (!background) setLoading(false) })
  }, [recordHistory])

  // A background poll accumulates trend history between explicit refresh
  // triggers, same pattern ConversationTimelinePanel already uses — but
  // never re-shows the loading state, so live charts hold their frame
  // while refetching (no flash, no layout jump) per dataviz's own
  // interaction contract.
  useEffect(() => {
    load(false)
    const timer = window.setInterval(() => load(true), HISTORY_POLL_MS)
    return () => window.clearInterval(timer)
  }, [refreshSeq]) // eslint-disable-line react-hooks/exhaustive-deps -- load is a stable useCallback

  const counters = snapshot?.metrics?.counters
  const gauges = snapshot?.metrics?.gauges
  const histograms = snapshot?.metrics?.histograms as Record<string, HistStats> | undefined

  // ── Executions ──────────────────────────────────────────────────────
  const execBreakdown = useMemo(() => breakdownByTag(counters, 'execution.total', 'status', 'status'), [counters])
  const execCompleted = useMemo(() => Object.values(execBreakdown.get('completed') ?? {}).reduce((a, b) => a + b, 0), [execBreakdown])
  const execFailed = useMemo(() => Object.values(execBreakdown.get('failed') ?? {}).reduce((a, b) => a + b, 0), [execBreakdown])
  const execTotal = execCompleted + execFailed
  const execRows: SplitRow[] = useMemo(() => [{
    key: 'execution.total', label: 'Executions',
    segments: [
      { name: 'Completed', value: execCompleted, color: 'success' as Segment },
      { name: 'Failed', value: execFailed, color: 'danger' as Segment },
    ],
  }], [execCompleted, execFailed])

  const stepBreakdown = useMemo(() => breakdownByTag(counters, 'execution.step.total', 'status', 'status'), [counters])
  const stepRows: SplitRow[] = useMemo(() => {
    const all = new Set<string>()
    for (const bucket of stepBreakdown.values()) for (const s of Object.keys(bucket)) all.add(s)
    if (all.size === 0) return []
    return [{
      key: 'execution.step.total', label: 'Steps',
      segments: [...all].map((status) => ({
        name: status, value: Object.values(stepBreakdown.get(status) ?? {}).reduce((a, b) => a + b, 0),
        color: status === 'succeeded' ? 'success' as Segment : status === 'failed' ? 'danger' as Segment : 'warning' as Segment,
      })),
    }]
  }, [stepBreakdown])

  const activeExecutions = gauges?.['execution.active:'] ?? null
  const execLatency = histograms?.['execution.duration_ms']
  const stepLatency = histograms?.['execution.step.duration_ms']

  // ── Planning ────────────────────────────────────────────────────────
  const planRows: Row[] = useMemo(() => {
    const rows: Row[] = []
    const add = (key: string, label: string) => { const v = counters?.[key]; if (v !== undefined) rows.push({ key, label, value: v }) }
    add('plan.total:status=created', 'Plans created')
    add('plan.validation.total:result=stale', 'Plans invalidated')
    add('plan.replan.total:', 'Replans')
    return rows.sort((a, b) => b.value - a.value)
  }, [counters])
  const plansCreated = counters?.['plan.total:status=created'] ?? 0
  const plansStale = counters?.['plan.validation.total:result=stale'] ?? 0
  const planStability = plansCreated > 0 ? (1 - plansStale / plansCreated) * 100 : null

  // ── LLM ─────────────────────────────────────────────────────────────
  const llmBreakdown = useMemo(() => breakdownByTag(counters, 'llm.calls.total', 'model', 'status'), [counters])
  const llmRows: SplitRow[] = useMemo(() => [...llmBreakdown.entries()].map(([model, statuses]) => ({
    key: `llm:${model}`, label: model,
    segments: Object.entries(statuses).map(([status, value]) => ({
      name: status, value,
      color: status === 'success' ? 'success' as Segment : status === 'timeout' ? 'warning' as Segment : 'danger' as Segment,
    })),
  })), [llmBreakdown])
  const llmSuccessTotal = useMemo(() => [...llmBreakdown.values()].reduce((sum, statuses) => sum + (statuses.success ?? 0), 0), [llmBreakdown])
  const llmTotal = useMemo(() => [...llmBreakdown.values()].reduce((sum, statuses) => sum + Object.values(statuses).reduce((a, b) => a + b, 0), 0), [llmBreakdown])
  const llmLatencyRows: HistRow[] = useMemo(() => {
    if (!histograms) return []
    return Object.entries(histograms)
      .filter(([k]) => k === 'llm.call.duration_ms' || k.startsWith('llm.call.duration_ms:'))
      .map(([k, stats]) => { const { sub } = splitKey(k); return { key: k, label: 'LLM call latency', sub, stats } })
  }, [histograms])

  // ── Capabilities ────────────────────────────────────────────────────
  const capBreakdown = useMemo(() => breakdownByTag(counters, 'capability.calls.total', 'capability', 'status'), [counters])
  const capRows: SplitRow[] = useMemo(() => [...capBreakdown.entries()]
    .map(([capability, statuses]) => ({
      key: `cap:${capability}`, label: capability,
      total: Object.values(statuses).reduce((a, b) => a + b, 0),
      segments: Object.entries(statuses).map(([status, value]) => ({
        name: status, value,
        color: status === 'success' ? 'success' as Segment : status === 'blocked' ? 'warning' as Segment : 'danger' as Segment,
      })),
    }))
    .sort((a, b) => b.total - a.total)
    .map(({ key, label, segments }) => ({ key, label, segments })), [capBreakdown])
  const capLatencyRows: Row[] = useMemo(() => {
    if (!histograms) return []
    return Object.entries(histograms)
      .filter(([k]) => k.startsWith('capability.duration_ms:'))
      .map(([k, stats]) => { const { sub } = splitKey(k); return { key: k, label: sub.replace('capability=', ''), value: Math.round((stats.p95 ?? 0) * 100) / 100 } })
      .sort((a, b) => b.value - a.value)
  }, [histograms])

  // ── Reliability ─────────────────────────────────────────────────────
  const reliabilityRows: Row[] = useMemo(() => {
    const rows: Row[] = []
    const add = (key: string, label: string) => { const v = counters?.[key]; if (v !== undefined) rows.push({ key, label, value: v }) }
    add('idempotency.requests.total:result=replay', 'Idempotency replays')
    add('idempotency.requests.total:result=conflict', 'Idempotency conflicts')
    add('audit.write_errors.total:', 'Audit write errors')
    return rows.sort((a, b) => b.value - a.value)
  }, [counters])
  const idempotencyReplays = counters?.['idempotency.requests.total:result=replay'] ?? 0
  const idempotencyConflicts = counters?.['idempotency.requests.total:result=conflict'] ?? 0
  const idempotencyTotal = idempotencyReplays + idempotencyConflicts

  // ── Pipeline Stages data — one entry per real cognitive-tick stage
  // (comparison/integration.py::ComparisonIntegratedPolicy.configure()'s
  // real, live order), rendered as collapsible drawers by PipelineStages
  // below. Telemetry only — ArchitectureDiagram (static Mermaid) is the
  // structural source of truth and does not read this. Reuses the curated
  // Execution/Planning numbers already computed above rather than
  // re-deriving them. Predict, TransitionGate, Compare, and
  // Learn/LearnTransitions are instrumented (previously zero counters/
  // gauges/histograms anywhere in the kernel — confirmed by grepping
  // every _obs call site) — a quiet drawer here means this session's
  // backend hasn't emitted a value yet, not a structural gap.
  const pipelineStages: Record<string, Stage> = useMemo(() => {
    const kgEntities = gauges?.['planetary.knowledge_graph_entities:']
    const worldEntities = gauges?.['planetary.world_graph_entities:']
    const beliefsCreated = counters?.['cognitive.beliefs_created:']
    const intentsClassified = counters?.['cognitive.intents_classified:']
    const plansGenerated = counters?.['cognitive.plans_generated:']
    const plannerLatency = gauges?.['pipeline.planner_latency_ms:']
    const decisionsMade = counters?.['cognitive.decisions_made:']
    const negotiationsStarted = counters?.['negotiation.negotiations_started:']
    const negotiationsCompleted = counters?.['negotiation.negotiations_completed:']
    const execP95 = execLatency?.p95

    const m = (label: string, v: number | undefined): StageMetric[] => v === undefined ? [] : [{ label, value: fmtNum(v) }]

    // Sums every counter matching `name`, across whatever tag combination
    // each entry carries (mirrors breakdownByTag's own parseCounterKey use
    // above) — the tag VALUES are dynamic (recommendation text, bool
    // strings), so an exact bare-key lookup like the gauges above can't
    // work here.
    const sumByPrefix = (bag: Record<string, number> | undefined, name: string, filter?: (tags: Record<string, string>) => boolean): number | undefined => {
      if (!bag) return undefined
      let total: number | undefined
      for (const [k, v] of Object.entries(bag)) {
        const parsed = parseCounterKey(k)
        if (parsed.name !== name) continue
        if (filter && !filter(parsed.tags)) continue
        total = (total ?? 0) + v
      }
      return total
    }

    const predictionTotal = sumByPrefix(counters, 'prediction.total')
    const predictionCandidates = gauges?.['prediction.candidates:']
    const predictSelectedProb = gauges?.['prediction.selected_probability:']
    const predictP95 = sumHistogramPrefix(histograms, 'prediction.duration_ms')?.p95
    const gateEvaluations = sumByPrefix(counters, 'transition_gate.evaluations.total')
    const gateNegotiationRequired = sumByPrefix(counters, 'transition_gate.evaluations.total', (t) => t.requires_negotiation === 'True')
    const compareTotal = sumByPrefix(counters, 'compare.total')
    const compareActorLoss = gauges?.['compare.actor_loss:']
    const compareWorldLoss = gauges?.['compare.world_loss:']
    const learnSuccess = counters?.['learn.transitions.total:success=True']
    const learnFailure = counters?.['learn.transitions.total:success=False']
    const policyStoreUpdates = sumByPrefix(counters, 'learn.policy_store_updates.total')
    const learnKnownTransitions = gauges?.['learn.known_transitions:']

    // Newly-instrumented stages (Observe, Observe Outcome, Learn, World
    // Commit were previously genuine structural gaps — see the "not
    // instrumented" -> "metric" flip below for each).
    const observeTotal = sumByPrefix(counters, 'observe.total')
    const observationsAcquired = gauges?.['observe.observations_acquired:']
    const worldSnapshotStates = gauges?.['observe.world_snapshot_states:']
    const observeP95 = sumHistogramPrefix(histograms, 'observe.duration_ms')?.p95
    const observeOutcomeTotal = sumByPrefix(counters, 'observe_outcome.total')
    const actionsExecuted = gauges?.['observe_outcome.actions_executed:']
    const learnTotal = sumByPrefix(counters, 'learn.total')
    const learnReward = gauges?.['learn.reward:']
    const learnSignalsApplied = gauges?.['learn.signals_applied:']
    const beliefUpdatedTrue = sumByPrefix(counters, 'learn.belief_updated.total', (t) => t.updated === 'True')
    const worldUpdatedTrue = sumByPrefix(counters, 'learn.world_updated.total', (t) => t.updated === 'True')
    const worldCommitAllowed = sumByPrefix(counters, 'world_commit.total', (t) => t.security_outcome === 'allowed')
    const worldCommitTotal = sumByPrefix(counters, 'world_commit.total')

    return {
      goal: { id: 'goal', title: 'Citizen / Actor Goal', metrics: [], kind: 'decorative' },
      world_state: { id: 'world_state', title: 'World State', metrics: [...m('KG entities', kgEntities), ...m('world entities', worldEntities)], kind: 'metric',
        note: 'planetary.knowledge_graph_entities / planetary.world_graph_entities.' },
      // CognitiveOS is the full stack (every stage below), not one node —
      // Observe and Believe are the two real, separate stages Mermaid's
      // O/B nodes represent (pipeline/belief_runtime.py::_observe /
      // ::_update_beliefs, wired as believe=lambda state: self.
      // _update_beliefs(state) in CognitiveRuntime.__init__).
      observe: { id: 'observe', title: 'Observe', kind: 'metric',
        metrics: [...m('ticks', observeTotal), ...m('observations acquired', observationsAcquired), ...m('snapshot states', worldSnapshotStates), ...(observeP95 !== undefined ? [{ label: 'p95 latency', value: fmtMs(observeP95) }] : [])],
        note: 'observe.total / observe.observations_acquired / observe.world_snapshot_states / observe.duration_ms — from pipeline/belief_runtime.py::_observe.' },
      believe: { id: 'believe', title: 'Believe', metrics: [...m('intents classified', intentsClassified), ...m('beliefs persisted', beliefsCreated)], kind: 'metric',
        note: 'cognitive.intents_classified / cognitive.beliefs_created — emitted by compile/cognitive_actor.py::_record_cognitive_artifacts from state.belief.intent / belief.metadata["relevant_knowledge"], both real outputs of _update_beliefs (the Believe stage), recorded once the tick completes rather than inline in that method.' },
      plan: { id: 'plan', title: 'Plan', metrics: [...m('plans created', plansCreated || undefined), ...m('plans generated', plansGenerated), ...(plannerLatency !== undefined ? [{ label: 'planner latency', value: fmtMs(plannerLatency) }] : [])], kind: 'metric',
        note: 'plan.total:status=created / cognitive.plans_generated / pipeline.planner_latency_ms.' },
      predict: { id: 'predict', title: 'Predict', kind: 'metric',
        metrics: [...m('forecasts', predictionTotal), ...m('candidates', predictionCandidates), ...m('selected prob.', predictSelectedProb !== undefined ? Math.round(predictSelectedProb * 100) / 100 : undefined), ...(predictP95 !== undefined ? [{ label: 'p95 latency', value: fmtMs(predictP95) }] : [])],
        note: 'prediction.total / prediction.candidates / prediction.selected_probability / prediction.duration_ms — from pipeline/prediction/integration.py (not the dead kernel/predict/ JEPA/MCTS tree, which stays unwired).' },
      decide: { id: 'decide', title: 'Decide', metrics: [...m('replans', counters?.['plan.replan.total:']), ...m('stale plans', plansStale || undefined), ...m('decisions made', decisionsMade)], kind: 'metric',
        note: 'Plan hysteresis verdict (keep vs replace). plan.replan.total / plan.validation.total:result=stale / cognitive.decisions_made.' },
      execute: { id: 'execute', title: 'Execute (totals)', metrics: [...m('completed', execCompleted || undefined), ...m('failed', execFailed || undefined), ...(execP95 !== undefined ? [{ label: 'p95 latency', value: fmtMs(execP95) }] : [])], kind: 'metric',
        note: 'execution.total by outcome; execution.duration_ms p95.' },
      transition_gate: { id: 'transition_gate', title: 'TransitionGate', kind: 'metric',
        metrics: [...m('evaluated', gateEvaluations), ...m('required negotiation', gateNegotiationRequired)],
        note: 'transition_gate.evaluations.total, tagged allow/requires_negotiation — action_executor.py evaluates it per action, before any capability runs.' },
      negotiation: { id: 'negotiation', title: 'Negotiation', metrics: [...m('started', negotiationsStarted), ...m('completed', negotiationsCompleted)], kind: 'metric',
        note: 'negotiation.negotiations_started/completed come from the game-theoretic subsystem (society/integration.py) — not confirmed to be the same code path as TransitionGate’s requires_negotiation flow, which itself emits nothing.' },
      // world.revision/world.transitions (kernel/compile/tensor.py::
      // SparseTransitionTensor.batch_update) remain excluded: their only
      // callers are kernel/compile/exchange.py, world_model_runtime.py,
      // tenancy.py — a confirmed-separate tensor-based world model, with
      // zero call sites in the KG-based commerce commit path this node
      // represents. world_commit.total below is a NEW, correctly-scoped
      // counter added directly at action_executor.py's real gate-cleared
      // call site instead — tagged by the gate's own security_outcome
      // ("allowed" means eligible to proceed to the real capability call,
      // not proof the KG write itself succeeded; grocery.py's try_reserve
      // still has no counter of its own for that literal step).
      commit: { id: 'commit', title: 'World Commit', kind: 'metric',
        metrics: [...m('gate-cleared commits', worldCommitAllowed), ...m('total gated', worldCommitTotal)],
        note: 'world_commit.total, tagged security_outcome (allowed/paused_for_negotiation/negotiation_rejected) — action_executor.py, right after the TransitionGate decision that gates this commit.' },
      observe_outcome: { id: 'observe_outcome', title: 'Observe Outcome', kind: 'metric',
        metrics: [...m('outcomes observed', observeOutcomeTotal), ...m('actions executed', actionsExecuted)],
        note: 'observe_outcome.total (tagged goal_achieved) / observe_outcome.actions_executed — from pipeline/belief_runtime.py::_observe_outcome.' },
      compare: { id: 'compare', title: 'Compare', kind: 'metric',
        metrics: [...m('comparisons', compareTotal), ...m('actor loss', compareActorLoss !== undefined ? Math.round(compareActorLoss * 1000) / 1000 : undefined), ...m('world loss', compareWorldLoss !== undefined ? Math.round(compareWorldLoss * 1000) / 1000 : undefined)],
        note: 'compare.total (by outcome) / compare.actor_loss / compare.world_loss / compare.policy_loss — measurement only, matches comparator_runtime.py\'s own "Comparator MEASURES" principle. Does not mutate learning state.' },
      learn: { id: 'learn', title: 'Learn', kind: 'metric',
        metrics: [...m('ticks', learnTotal), ...m('avg reward', learnReward !== undefined ? Math.round(learnReward * 1000) / 1000 : undefined), ...m('signals applied', learnSignalsApplied), ...m('belief updated', beliefUpdatedTrue), ...m('world updated', worldUpdatedTrue)],
        note: 'learn.total / learn.reward / learn.signals_applied / learn.belief_updated.total / learn.world_updated.total — learning/integration.py::integrated_learn\'s reward/belief/world pipeline. Distinct from learn.transitions.total (the separate LearnTransitions stage, below).' },
      learn_transitions: { id: 'learn_transitions', title: 'LearnTransitions', kind: 'metric',
        metrics: [...m('TransitionModel: ok', learnSuccess), ...m('TransitionModel: failed', learnFailure), ...m('PolicyStore updates', policyStoreUpdates), ...m('known transitions', learnKnownTransitions)],
        note: 'learn.transitions.total (TransitionModel, by success) / learn.policy_store_updates.total (PolicyStore) / learn.known_transitions — real, persisted mutations, gated on Comparator evidence (_apply_transition_learning).' },
    }
  }, [gauges, counters, histograms, execLatency, plansCreated, plansStale, execCompleted, execFailed])

  // ── Every raw key already spent above, so "All Metrics" below shows
  // every remaining real key exactly once — nothing hidden, nothing
  // duplicated. ─────────────────────────────────────────────────────
  const usedKeys = useMemo(() => {
    const used = new Set<string>()
    const spendPrefix = (bag: Record<string, unknown> | undefined, prefix: string) => {
      if (!bag) return
      for (const k of Object.keys(bag)) if (k === prefix || k.startsWith(`${prefix}:`)) used.add(k)
    }
    spendPrefix(counters, 'execution.total')
    spendPrefix(counters, 'execution.step.total')
    spendPrefix(gauges, 'execution.active')
    spendPrefix(counters, 'plan.total')
    spendPrefix(counters, 'plan.validation.total')
    spendPrefix(counters, 'plan.replan.total')
    spendPrefix(counters, 'llm.calls.total')
    spendPrefix(counters, 'capability.calls.total')
    spendPrefix(counters, 'idempotency.requests.total')
    spendPrefix(counters, 'audit.write_errors.total')
    spendPrefix(histograms, 'execution.duration_ms')
    spendPrefix(histograms, 'execution.step.duration_ms')
    spendPrefix(histograms, 'llm.call.duration_ms')
    spendPrefix(histograms, 'capability.duration_ms')
    // Spent by the Pipeline Stages drawers below.
    spendPrefix(gauges, 'planetary.knowledge_graph_entities')
    spendPrefix(gauges, 'planetary.world_graph_entities')
    spendPrefix(counters, 'cognitive.beliefs_created')
    spendPrefix(counters, 'cognitive.intents_classified')
    spendPrefix(counters, 'cognitive.plans_generated')
    spendPrefix(gauges, 'pipeline.planner_latency_ms')
    spendPrefix(counters, 'cognitive.decisions_made')
    spendPrefix(counters, 'negotiation.negotiations_started')
    spendPrefix(counters, 'negotiation.negotiations_completed')
    // world.revision/world.transitions deliberately NOT spent here — see
    // the "commit" stage's own comment above for why (different, unconfirmed
    // subsystem) — they fall through to "All Metrics" instead, honestly.
    spendPrefix(counters, 'prediction.total')
    spendPrefix(gauges, 'prediction.candidates')
    spendPrefix(gauges, 'prediction.selected_probability')
    spendPrefix(histograms, 'prediction.duration_ms')
    spendPrefix(counters, 'transition_gate.evaluations.total')
    spendPrefix(counters, 'compare.total')
    spendPrefix(gauges, 'compare.actor_loss')
    spendPrefix(gauges, 'compare.world_loss')
    spendPrefix(gauges, 'compare.policy_loss')
    spendPrefix(counters, 'learn.transitions.total')
    spendPrefix(counters, 'learn.skipped.total')
    spendPrefix(counters, 'learn.policy_store_updates.total')
    spendPrefix(gauges, 'learn.known_transitions')
    spendPrefix(counters, 'observe.total')
    spendPrefix(gauges, 'observe.observations_acquired')
    spendPrefix(gauges, 'observe.world_snapshot_states')
    spendPrefix(histograms, 'observe.duration_ms')
    spendPrefix(counters, 'observe_outcome.total')
    spendPrefix(gauges, 'observe_outcome.actions_executed')
    spendPrefix(counters, 'learn.total')
    spendPrefix(gauges, 'learn.reward')
    spendPrefix(gauges, 'learn.signals_applied')
    spendPrefix(counters, 'learn.belief_updated.total')
    spendPrefix(counters, 'learn.world_updated.total')
    spendPrefix(counters, 'world_commit.total')
    return used
  }, [counters, gauges, histograms])

  const remainingGroups = useMemo(() => {
    const groups = new Map<string, { counterRows: Row[]; gaugeRows: Row[]; histRows: HistRow[] }>()
    const ensure = (ns: string) => {
      let g = groups.get(ns)
      if (!g) { g = { counterRows: [], gaugeRows: [], histRows: [] }; groups.set(ns, g) }
      return g
    }
    for (const [key, value] of Object.entries(counters ?? {})) {
      if (usedKeys.has(key)) continue
      const { name, sub } = splitKey(key)
      ensure(namespaceOf(key)).counterRows.push({ key, label: name, sub, value })
    }
    for (const [key, value] of Object.entries(gauges ?? {})) {
      if (usedKeys.has(key)) continue
      const { name, sub } = splitKey(key)
      ensure(namespaceOf(key)).gaugeRows.push({ key, label: name, sub, value })
    }
    for (const [key, stats] of Object.entries(histograms ?? {})) {
      if (usedKeys.has(key)) continue
      const { name, sub } = splitKey(key)
      ensure(namespaceOf(key)).histRows.push({ key, label: name, sub, stats })
    }
    for (const g of groups.values()) {
      g.counterRows.sort((a, b) => b.value - a.value)
      g.gaugeRows.sort((a, b) => b.value - a.value)
    }
    return [...groups.entries()].sort((a, b) => namespaceLabel(a[0]).localeCompare(namespaceLabel(b[0])))
  }, [counters, gauges, histograms, usedKeys])

  const totalRemaining = remainingGroups.reduce((sum, [, g]) => sum + g.counterRows.length + g.gaugeRows.length + g.histRows.length, 0)
  const totalMetrics = Object.keys(counters ?? {}).length + Object.keys(gauges ?? {}).length + Object.keys(histograms ?? {}).length

  return <div className="lwe-lm-page">
    <div className="lwe-lm-heading">
      <h2>Lemon Metrics</h2>
      <p>Every counter, gauge, and histogram the runtime currently exports ({totalMetrics} series) — charted, not tabled. Real values only; a metric with no data is simply absent.</p>
    </div>

    {error && <div className="lwe-lm-error">⚠ {error}</div>}
    {loading && <div className="lwe-inspector-muted" style={{ padding: 12 }}>Loading metrics…</div>}

    {!loading && <>
      <Section title="Architecture" description="The canonical CognitiveOS execution model — static structure, not live data. Renders identically with no backend running.">
        <ArchitectureDiagram />
      </Section>

      <Section title="Pipeline Stages" count={STAGE_ORDER.length} description="Every real cognitive-tick stage (comparison/integration.py), one drawer each, with whatever real telemetry that stage currently exports. This is the 'what is CognitiveOS doing right now' view — Architecture above is the 'what CognitiveOS is' view, and never reads this data.">
        <PipelineStages stages={pipelineStages} />
      </Section>

      <Section title="Executions" description="execution.total by outcome, execution.step.total by outcome, and duration_ms histograms.">
        <Meter label="Success rate" value={execTotal > 0 ? (execCompleted / execTotal) * 100 : null} />
        <SplitList rows={execRows} />
        <div className="lwe-lm-stat-row">
          <StatTile label="Active executions" value={activeExecutions} points={history.get('execution.active:') ?? []} />
        </div>
        {execLatency && <>
          <p className="lwe-lm-subhead">Latency trend (p95)</p>
          <Sparkline points={history.get('trend:execution.duration_ms:p95') ?? []} format={fmtMs} />
          <HistogramList rows={[{ key: 'execution.duration_ms', label: 'Execution latency', stats: execLatency }]} />
        </>}
        <SplitList rows={stepRows} />
        {stepLatency && <HistogramList rows={[{ key: 'execution.step.duration_ms', label: 'Step latency', stats: stepLatency }]} />}
      </Section>

      {planRows.length > 0 && <Section title="Planning">
        <Meter label="Plan stability" value={planStability} />
        <BarList rows={planRows} color="accent" />
      </Section>}

      {(llmRows.length > 0 || llmLatencyRows.length > 0) && <Section title="LLM" description="llm.calls.total by model, broken down by outcome.">
        <Meter label="Success rate" value={llmTotal > 0 ? (llmSuccessTotal / llmTotal) * 100 : null} />
        <SplitList rows={llmRows} />
        {llmLatencyRows.length > 0 && <>
          <p className="lwe-lm-subhead">Latency trend (p95)</p>
          <Sparkline points={history.get('trend:llm.call.duration_ms:p95') ?? []} format={fmtMs} />
          <HistogramList rows={llmLatencyRows} />
        </>}
      </Section>}

      {(capRows.length > 0 || capLatencyRows.length > 0) && <Section title="Capabilities" description="capability.calls.total per capability, broken down by outcome; p95 latency per capability.">
        <SplitList rows={capRows} />
        {capLatencyRows.length > 0 && <>
          <p className="lwe-lm-subhead">P95 latency by capability</p>
          <BarList rows={capLatencyRows} color="accent" format={(r) => fmtMs(r.value)} />
          <p className="lwe-lm-subhead">Overall latency trend (p95)</p>
          <Sparkline points={history.get('trend:capability.duration_ms:p95') ?? []} format={fmtMs} />
        </>}
      </Section>}

      {reliabilityRows.length > 0 && <Section title="Reliability">
        <Meter label="Clean idempotency rate" value={idempotencyTotal > 0 ? (idempotencyReplays / idempotencyTotal) * 100 : null} />
        <BarList rows={reliabilityRows} color="warning" />
      </Section>}

      {totalRemaining > 0 && <Section title="All Metrics" count={totalRemaining} description="Every remaining exported series, grouped by namespace and charted the same way — nothing above is repeated here.">
        <div className="lwe-lm-all">
          {remainingGroups.map(([ns, g]) => {
            const count = g.counterRows.length + g.gaugeRows.length + g.histRows.length
            if (count === 0) return null
            return <details className="lwe-lm-group" key={ns}>
              <summary>{namespaceLabel(ns)}<span className="lwe-lm-group-count">{count}</span></summary>
              <div className="lwe-lm-group-body">
                {g.counterRows.length > 0 && <div><p className="lwe-lm-subhead">Counters</p><BarList rows={g.counterRows} color="accent" format={(r) => fmtAuto(r.label, r.value)} /></div>}
                {g.gaugeRows.length > 0 && <div>
                  <p className="lwe-lm-subhead">Gauges</p>
                  {/* A gauge is an instantaneous reading — once this page has
                      observed it more than once, its trend is the more
                      honest form than a lone magnitude bar (choosing-a-form:
                      "a single current value + maybe a trend" → stat tile). */}
                  <div className="lwe-lm-stat-grid">
                    {g.gaugeRows.map((r) => {
                      const points = history.get(r.key) ?? []
                      return points.length >= 2
                        ? <StatTile key={r.key} label={r.label} value={r.value} format={(v) => fmtAuto(r.label, v)} points={points} />
                        : <div className="lwe-lm-stat" key={r.key} title={`${r.label}: ${fmtAuto(r.label, r.value)}`}>
                          <div className="lwe-lm-stat-head"><span className="lwe-lm-bar-label">{r.label}</span><span className="lwe-lm-stat-value">{fmtAuto(r.label, r.value)}</span></div>
                          <div className="lwe-lm-spark-empty">Collecting live trend…</div>
                        </div>
                    })}
                  </div>
                </div>}
                {g.histRows.length > 0 && <div><p className="lwe-lm-subhead">Latency</p><HistogramList rows={g.histRows} /></div>}
              </div>
            </details>
          })}
        </div>
      </Section>}
    </>}
  </div>
}
