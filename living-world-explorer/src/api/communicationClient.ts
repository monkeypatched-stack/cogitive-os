import { apiClient } from './client'

// Reuse the existing communication-log client — do not duplicate it.
// See societyClient.ts's own comment: mirrors
// AffiliationCommunicationRouter.CommunicationDecision, a real record of
// one actor-to-actor message this society's runtime actually routed or
// denied.
export { fetchSocietyCommunicationLog, type CommunicationLogEntry } from './societyClient'
export { fetchSocieties, fetchSocietyContext, type Society, type SocietyContextEvent } from './actorClient'

// GET /observability — the real Lemon metrics export, shared by both the
// Communication page (communication.*/game_theory.* counters) and the
// Lemon Metrics page (LemonMetricsPanel.tsx — execution/plan/llm/
// capability/idempotency/audit/grounding counters). Untyped beyond the
// counters/gauges/histograms bags: this is a free-form Lemon export, not
// a per-feature response model — each page reads the specific keys it
// needs via sumCounterPrefix/sumHistogramPrefix below.
export interface ObservabilitySnapshot {
  summary?: Record<string, unknown>
  metrics?: {
    counters?: Record<string, number>
    gauges?: Record<string, number>
    histograms?: Record<string, { count: number; min?: number; max?: number; avg?: number; p50?: number; p95?: number; p99?: number }>
    [key: string]: unknown
  }
  health?: Record<string, unknown>
  [key: string]: unknown
}

export function fetchObservabilitySnapshot(): Promise<ObservabilitySnapshot> {
  return apiClient.request<ObservabilitySnapshot>('/observability')
}

// Lemon builds a counter/gauge/histogram key as "name:tag1=val1:tag2=val2"
// with tags SORTED ALPHABETICALLY BY KEY (kernel-side: sorted(tags.items())),
// not insertion order — so for a multi-tag metric (e.g.
// llm.calls.total{provider,model,operation,status}), the tag you want to
// filter by is not necessarily right after the colon. sumCounterPrefix
// above is only safe for single-tag (or zero-tag) metrics, where the
// wanted value IS the whole suffix. This parses every key's tags into a
// map so multi-tag metrics can be filtered by exactly one tag regardless
// of where it sorts among the others.
export function parseCounterKey(key: string): { name: string; tags: Record<string, string> } {
  const [name, ...tagParts] = key.split(':')
  const tags: Record<string, string> = {}
  for (const part of tagParts) {
    const eq = part.indexOf('=')
    if (eq >= 0) tags[part.slice(0, eq)] = part.slice(eq + 1)
  }
  return { name, tags }
}

export function sumCounterByTag(
  counters: Record<string, number> | undefined, name: string, tagKey: string, tagValue: string,
): number | null {
  if (!counters) return null
  let total = 0, found = false
  for (const [key, value] of Object.entries(counters)) {
    const parsed = parseCounterKey(key)
    if (parsed.name === name && parsed.tags[tagKey] === tagValue) {
      total += value
      found = true
    }
  }
  return found ? total : null
}

export interface AggregatedHistogram { count: number; p50: number; p95: number; p99: number }

// Histogram keys are the same "name:label=value:..." shape counters use.
// Percentiles can't be validly averaged across different label
// combinations (e.g. capability=Payment vs capability=ProductSelection) —
// this sums the sample counts (a real total) and takes the MAX p50/p95/
// p99 across matching entries, a deliberately conservative "worst tail
// latency seen across any tag combination" rather than a mathematically
// invalid blended percentile.
type HistogramBag = NonNullable<NonNullable<ObservabilitySnapshot['metrics']>['histograms']>

export function sumHistogramPrefix(histograms: HistogramBag | undefined, prefix: string): AggregatedHistogram | null {
  if (!histograms) return null
  let count = 0, p50 = 0, p95 = 0, p99 = 0, found = false
  for (const [key, stats] of Object.entries(histograms)) {
    if ((key === prefix || key.startsWith(`${prefix}:`)) && stats && stats.count > 0) {
      found = true
      count += stats.count
      p50 = Math.max(p50, stats.p50 ?? 0)
      p95 = Math.max(p95, stats.p95 ?? 0)
      p99 = Math.max(p99, stats.p99 ?? 0)
    }
  }
  return found ? { count, p50, p95, p99 } : null
}

// Lemon counter keys are "name:label1=value1:label2=value2" strings, not a
// nested object — this helper sums every counter whose key starts with a
// given metric name (with or without labels), so the UI never has to
// guess a label combination that may not exist for the current dataset.
export function sumCounterPrefix(counters: Record<string, number> | undefined, prefix: string): number | null {
  if (!counters) return null
  let total = 0
  let found = false
  for (const [key, value] of Object.entries(counters)) {
    if (key === prefix || key.startsWith(`${prefix}:`)) {
      total += value
      found = true
    }
  }
  return found ? total : null
}
