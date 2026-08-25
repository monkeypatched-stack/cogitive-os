import type { GeoEntity, WorldLocation } from '../api/geoClient'

export interface ResolvedLocation {
  location: WorldLocation
  /** true when `location` came from the entity's own world_location_id;
   * false when inherited from the nearest located ancestor (e.g. a
   * Space rendered/addressed at its parent Building's position because
   * it has no location of its own yet). Callers must show this — an
   * inherited position/address is real, but not this entity's own, and
   * implying otherwise would overstate the precision. */
  own: boolean
}

/** Walks up parent_id from `id` until an ancestor (or the entity
 * itself) has a world_location_id that resolves to a real WorldLocation.
 * Shared by the Map (needs lat/lon) and the Inspector (needs the
 * human-readable address string too) — one real resolution rule, not
 * two copies that could quietly drift apart. */
export function resolveWorldLocation(
  entitiesById: Record<string, GeoEntity>,
  locationsById: Record<string, WorldLocation>,
  id: string,
): ResolvedLocation | null {
  let current: string | null = id
  let own = true
  while (current) {
    const entity: GeoEntity | undefined = entitiesById[current]
    if (!entity) return null
    if (entity.world_location_id) {
      const location = locationsById[entity.world_location_id]
      if (location) return { location, own }
    }
    current = entity.parent_id
    own = false
  }
  return null
}
