import { create } from 'zustand'
import {
  fetchGeoEntities, fetchWorldLocations, createGeoFromAddress,
  type GeoEntity, type WorldLocation, type CreateGeoFromAddressBody,
} from '../api/geoClient'
import { fetchActors, type Actor } from '../api/actorClient'
import { fetchCurrentOccupancy } from '../api/presenceClient'

export type WorldViewMode = 'geography' | 'actor' | 'society'

// PlanetaryRuntime.__init__ (kernel/society/integration.py) auto-creates
// this exact chain whenever geography is empty at boot — real, load-
// bearing fallback infrastructure (14 references throughout that file;
// it's where every Society with no other location gets auto-hosted, to
// satisfy "every Society must have a Space"), not throwaway demo data.
// Removing it from the backend risks breaking that invariant for every
// currently-registered actor/society, so it stays there — this only
// hides it from the World Tree's DISPLAY, matched by the exact
// (entity_type, name) pairs the bootstrap code hardcodes.
const DEFAULT_BOOTSTRAP_ENTITIES = new Set([
  'planet:Default Planet',
  'country:Default Country',
  'state:Default State',
  'county:Default County',
  'city:Default City',
  'street:Default Street',
  'building:Default Building',
  'space:Default Space',
])

function isDefaultBootstrapEntity(entity: GeoEntity): boolean {
  return DEFAULT_BOOTSTRAP_ENTITIES.has(`${entity.entity_type}:${entity.name}`)
}

interface WorldState {
  entitiesById: Record<string, GeoEntity>
  rootIds: string[]
  // Unfiltered — includes the hidden Default chain. The Geography tree
  // must never use this (that's the whole point of entitiesById), but
  // the Actor view's society-hosted fallback needs it: every actor's
  // Society is currently hosted at Default City (there's no other real
  // location for it yet), and silently resolving that to "nothing" via
  // the filtered map would make every actor look unlocated even though
  // they DO have a real, if generic, answer to "where is this actor's
  // society based."
  rawEntitiesById: Record<string, GeoEntity>
  locationsById: Record<string, WorldLocation>
  actorsById: Record<string, Actor>
  occupancyByActorId: Record<string, string>
  // society_id -> the one real GeographicEntity hosting it (single-host;
  // see GeographicRegistry.host_society's own docstring).
  societyToEntityId: Record<string, string>
  loading: boolean
  error: string | null

  viewMode: WorldViewMode
  expandedIds: Set<string>
  expandedActorIds: Set<string>
  selectedEntityId: string | null
  selectedActorId: string | null
  selectedSocietyId: string | null
  // Set by a page (e.g. OrdersWalletPanel) that wants "View execution
  // trace" to open the Execution Debugger already scoped to a specific
  // execution, instead of the Debugger's own default (most recent
  // execution for the selected actor). DataSourcesPanel consumes and
  // clears this once, so it never overrides a later, ordinary visit to
  // the Debugger.
  selectedExecutionId: string | null
  highlightedActorIds: Set<string>
  focusedEntityId: string | null
  searchQuery: string

  fetchEntities: () => Promise<void>
  toggleExpand: (id: string) => void
  expandIds: (ids: Iterable<string>) => void
  toggleActorExpand: (actorId: string) => void
  selectEntity: (id: string | null) => void
  selectActor: (id: string | null) => void
  selectSociety: (id: string | null) => void
  selectExecution: (id: string | null) => void
  highlightActors: (ids: Iterable<string>) => void
  setFocusedEntityId: (id: string | null) => void
  setSearchQuery: (query: string) => void
  setViewMode: (mode: WorldViewMode) => void
  createFromAddress: (body: CreateGeoFromAddressBody) => Promise<GeoEntity>
}

/**
 * Single source of truth for the World hierarchy (Planet -> Country ->
 * State -> County -> City -> Street -> Building -> Space) and the
 * user's current selection within it. Selection lives here, not in
 * WorldTreePanel's local state, specifically so other panels (the
 * Inspector today, the Map later) can react to it without prop
 * drilling — that's the real mechanism behind "selecting a node
 * notifies the rest of the UI."
 */
export const useWorldStore = create<WorldState>((set, get) => ({
  entitiesById: {},
  rootIds: [],
  rawEntitiesById: {},
  locationsById: {},
  actorsById: {},
  occupancyByActorId: {},
  societyToEntityId: {},
  loading: false,
  error: null,

  viewMode: 'geography',
  expandedIds: new Set(),
  expandedActorIds: new Set(),
  selectedEntityId: null,
  selectedActorId: null,
  selectedSocietyId: null,
  selectedExecutionId: null,
  highlightedActorIds: new Set(),
  focusedEntityId: null,
  searchQuery: '',

  fetchEntities: async () => {
    set({ loading: true, error: null })
    try {
      const [rawEntities, locations, actors, occupancyByActorId] = await Promise.all([
        fetchGeoEntities(), fetchWorldLocations(), fetchActors(), fetchCurrentOccupancy(),
      ])
      const hiddenIds = new Set(rawEntities.filter(isDefaultBootstrapEntity).map((e) => e.entity_id))
      const entities = rawEntities.filter((e) => !hiddenIds.has(e.entity_id))

      const rawEntitiesById: Record<string, GeoEntity> = {}
      const societyToEntityId: Record<string, string> = {}
      for (const entity of rawEntities) {
        rawEntitiesById[entity.entity_id] = entity
        for (const societyId of entity.hosted_society_ids) societyToEntityId[societyId] = entity.entity_id
      }

      const entitiesById: Record<string, GeoEntity> = {}
      const rootIds: string[] = []
      for (const entity of entities) {
        entitiesById[entity.entity_id] = entity
        // A root is anything with no parent, OR whose parent was hidden
        // (the bootstrap chain) — a real entity accidentally created
        // under "Default City" stays visible instead of silently
        // becoming unreachable.
        if (!entity.parent_id || hiddenIds.has(entity.parent_id)) rootIds.push(entity.entity_id)
      }
      const locationsById: Record<string, WorldLocation> = {}
      for (const location of locations) locationsById[location.location_id] = location
      const actorsById: Record<string, Actor> = {}
      for (const actor of actors) actorsById[actor.actor_id] = actor
      set({
        entitiesById, rootIds, rawEntitiesById, locationsById, actorsById,
        occupancyByActorId, societyToEntityId, loading: false,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  toggleExpand: (id) =>
    set((state) => {
      const next = new Set(state.expandedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedIds: next }
    }),

  expandIds: (ids) =>
    set((state) => {
      const next = new Set(state.expandedIds)
      for (const id of ids) next.add(id)
      return { expandedIds: next }
    }),

  selectEntity: (id) => {
    set({ selectedEntityId: id, selectedActorId: null, selectedSocietyId: null, focusedEntityId: id })
    if (id === null) return
    // Selecting a node reveals it: every ancestor on the path must be
    // expanded, or the "selected" node would be invisible in its own
    // tree (e.g. selecting a Space found via search whose Building/
    // Street/City ancestors are currently collapsed).
    const { entitiesById, expandIds } = get()
    const ancestors: string[] = []
    let current = entitiesById[id]?.parent_id
    while (current) {
      ancestors.push(current)
      current = entitiesById[current]?.parent_id
    }
    if (ancestors.length) expandIds(ancestors)
  },

  selectActor: (id) => set({ selectedActorId: id, selectedEntityId: null, focusedEntityId: null }),
  selectSociety: (id) => set({ selectedSocietyId: id, selectedEntityId: null, focusedEntityId: null }),
  selectExecution: (id) => set({ selectedExecutionId: id }),
  highlightActors: (ids) => set({ highlightedActorIds: new Set(ids) }),

  toggleActorExpand: (actorId) =>
    set((state) => {
      const next = new Set(state.expandedActorIds)
      if (next.has(actorId)) next.delete(actorId)
      else next.add(actorId)
      return { expandedActorIds: next }
    }),

  setFocusedEntityId: (id) => set({ focusedEntityId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setViewMode: (mode) => set({ viewMode: mode }),

  createFromAddress: async (body) => {
    const building = await createGeoFromAddress(body)
    // Refetch rather than splice the single new entity in by hand — the
    // create may have find-or-created several new ancestor tiers too
    // (a brand-new Country/State/.../Street), and re-deriving the whole
    // tree from the real API is simpler and more honest than trying to
    // predict the backend's find-or-create decisions client-side.
    await get().fetchEntities()
    get().selectEntity(building.entity_id)
    return building
  },
}))
