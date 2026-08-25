import { create } from 'zustand'

interface RefreshState {
  refreshSeq: number
  bumpRefresh: () => void
}

/** Generic "the world just changed, refetch yourself" signal — bumped by
 * anything that causes a real backend state change a panel might be
 * showing (a Planetary Tick, a chat-triggered actor prompt). Panels that
 * already poll on their own interval (Conversation Timeline, Event
 * Stream) still do, for changes with no explicit trigger; this makes
 * the KNOWN-trigger case immediate instead of waiting up to that
 * interval. Deliberately separate from cycleStore's tickSeq (which
 * carries tick-specific data — lastEvents, coordinatingSocietyIds) —
 * this is just a bump, no payload, for panels that only need to know
 * "refetch now," not what changed.
 */
export const useRefreshStore = create<RefreshState>((set) => ({
  refreshSeq: 0,
  bumpRefresh: () => set((state) => ({ refreshSeq: state.refreshSeq + 1 })),
}))
