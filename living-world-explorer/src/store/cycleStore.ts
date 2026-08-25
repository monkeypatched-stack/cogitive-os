import { create } from 'zustand'
import { triggerPlanetTick, type PlanetTickResult } from '../api/planetClient'
import { fetchSocieties, fetchSocietyContext, type SocietyContextEvent } from '../api/actorClient'
import { useWorldStore } from './worldStore'
import { useRefreshStore } from './refreshStore'

interface CycleState {
  ticking: boolean
  lastResult: PlanetTickResult | null
  // Client-side timestamp (epoch seconds) captured right before the
  // POST — the boundary used to tell "context events this cycle just
  // published" apart from everything already in the stream.
  tickStartedAt: number | null
  error: string
  // Increments on every successful tick, even if cycle_number itself
  // repeats (it never does in practice, but the request itself is the
  // real trigger) — components watch this, not lastResult, to re-run
  // their per-tick animation exactly once per real cycle.
  tickSeq: number
  // Real, deduped, chronologically-sorted Context Stream events this
  // cycle published (fetched once here, not per-consumer) — MapView's
  // propagation ripple and the Society panel's "just coordinated"
  // highlight both read this instead of each re-fetching it.
  lastEvents: SocietyContextEvent[]
  // Societies with at least one real INTERACTION event this cycle,
  // resolved via that event's actor -> actor.societies.
  coordinatingSocietyIds: Set<string>
  triggerTick: () => Promise<void>
}

/** Planetary Tick as shared, cross-panel state: the Toolbar triggers
 * it, MapView (real actor positions live there) reacts to it to
 * animate propagation, and the Society panel reacts to it to highlight
 * whichever Society just coordinated a request — decoupled through
 * this store instead of prop drilling. */
export const useCycleStore = create<CycleState>((set, get) => ({
  ticking: false,
  lastResult: null,
  tickStartedAt: null,
  error: '',
  tickSeq: 0,
  lastEvents: [],
  coordinatingSocietyIds: new Set(),

  triggerTick: async () => {
    set({ ticking: true, error: '', tickStartedAt: Date.now() / 1000 })
    try {
      const result = await triggerPlanetTick()
      const tickStartedAt = get().tickStartedAt ?? 0

      let lastEvents: SocietyContextEvent[] = []
      let coordinatingSocietyIds = new Set<string>()
      try {
        const societies = await fetchSocieties()
        const contextResults = await Promise.allSettled(
          societies.map((society) => fetchSocietyContext(society.society_id)),
        )
        const seen = new Set<string>()
        lastEvents = contextResults
          .flatMap((r) => (r.status === 'fulfilled' ? r.value.events : []))
          .filter((event) => (event.timestamp ?? 0) >= tickStartedAt)
          .filter((event) => {
            const key = event.event_id ?? `${event.actor_id}:${event.timestamp}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))

        const actorsById = useWorldStore.getState().actorsById
        for (const event of lastEvents) {
          if (String(event.event_type || '').toLowerCase() !== 'interaction') continue
          const actor = event.actor_id ? actorsById[event.actor_id] : undefined
          for (const societyId of actor?.societies ?? []) coordinatingSocietyIds.add(societyId)
        }
      } catch {
        // Propagation/coordination detail is best-effort on top of an
        // already-succeeded real tick — a failed fetch here shouldn't
        // surface as an app-level error.
      }

      set((state) => ({
        ticking: false, lastResult: result, tickSeq: state.tickSeq + 1,
        lastEvents, coordinatingSocietyIds,
      }))
      // Every panel that shows real state a tick can change (World Tree,
      // Map, Inspector, Conversation Timeline, Event Stream, Execution
      // Graph) refetches immediately instead of waiting on its own poll.
      useRefreshStore.getState().bumpRefresh()
    } catch (err) {
      set({ ticking: false, error: err instanceof Error ? err.message : String(err) })
    }
  },
}))
