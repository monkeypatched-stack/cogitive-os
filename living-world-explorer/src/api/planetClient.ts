import { apiClient } from './client'

// Mirrors PlanetaryCycleResult (kernel/society/integration.py) — one
// real planetary cycle: every active Society (reached by walking the
// full Planet->...->Space geography) ticks its actors' cognition,
// routes interactions, and publishes real Context Stream events.
export interface PlanetTickResult {
  cycle_number: number
  actors_observed: number
  beliefs_updated: number
  interactions_routed: number
  context_events: number
  duration_ms: number
}

// POST /planet/tick — triggers one real planetary cycle (PlanetaryRuntime.cycle()).
// The backend also runs this on its own auto-tick schedule (every 5
// minutes by default); this is the same operation, just triggered on
// demand so the animation is watchable rather than waited-for.
export function triggerPlanetTick(): Promise<PlanetTickResult> {
  return apiClient.request<PlanetTickResult>('/planet/tick', { method: 'POST' })
}
