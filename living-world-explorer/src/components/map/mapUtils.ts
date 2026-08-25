import { getPolygon, getEntrances, getLoadingDocks, type GeoEntity, type WorldLocation } from '../../api/geoClient'
import { resolveWorldLocation } from '../../lib/resolveLocation'
import type { Actor } from '../../api/actorClient'

export interface ResolvedPosition {
  latitude: number
  longitude: number
  own: boolean
}

function resolveLocation(
  entitiesById: Record<string, GeoEntity>,
  locationsById: Record<string, WorldLocation>,
  id: string,
): ResolvedPosition | null {
  const resolved = resolveWorldLocation(entitiesById, locationsById, id)
  if (!resolved) return null
  return { latitude: resolved.location.latitude, longitude: resolved.location.longitude, own: resolved.own }
}

export interface MapPoint {
  id: string
  name: string
  entityType: GeoEntity['entity_type']
  latitude: number
  longitude: number
  own: boolean
}

export interface MapRoad {
  id: string
  name: string
  positions: [number, number][] // [lng, lat] pairs, GeoJSON order
}

export interface MapPolygon {
  id: string
  name: string
  entityType: GeoEntity['entity_type']
  positions: [number, number][] // [lng, lat] pairs, GeoJSON order, closed ring
}

export interface MapFeaturePoint {
  id: string // `${entityId}:${index}`, unique per feature, not per entity
  entityId: string
  label: string
  longitude: number
  latitude: number
}

export interface ActorMapPoint {
  id: string
  name: string
  role: string
  status: string
  locationLabel: string
  latitude: number
  longitude: number
  directlyLocated: boolean
}

export function buildActorMapData(
  actorsById: Record<string, Actor>,
  occupancyByActorId: Record<string, string>,
  rawEntitiesById: Record<string, GeoEntity>,
  locationsById: Record<string, WorldLocation>,
  societyToEntityId: Record<string, string>,
): ActorMapPoint[] {
  const points: ActorMapPoint[] = []
  for (const actor of Object.values(actorsById)) {
    const presenceId = occupancyByActorId[actor.actor_id]
    const hostId = presenceId || societyToEntityId[actor.societies[0]]
    if (!hostId) continue
    const resolved = resolveWorldLocation(rawEntitiesById, locationsById, hostId)
    if (!resolved) continue
    const host = rawEntitiesById[hostId]
    points.push({
      id: actor.actor_id,
      name: actor.name,
      role: actor.actor_type || 'actor',
      status: actor.status || (actor.is_active ? 'active' : 'inactive'),
      locationLabel: host?.name || resolved.location.address || resolved.location.name,
      latitude: resolved.location.latitude,
      longitude: resolved.location.longitude,
      directlyLocated: !!presenceId,
    })
  }
  return points
}

/** Everything the map needs, derived once from the tree + locations:
 * one point per located (or location-inheriting) Building/Space, one
 * line per Street connecting its own located Building children in
 * child_ids order, and one polygon per Building/Space that has a real
 * footprint of its OWN (never the inherited kind — showing a Space
 * wearing its parent Building's exact outline would overstate what's
 * actually known about that specific Space) — the geometry IS the
 * tree, not a separate model. */
export function buildMapData(
  entitiesById: Record<string, GeoEntity>,
  locationsById: Record<string, WorldLocation>,
): { points: MapPoint[]; roads: MapRoad[]; polygons: MapPolygon[]; entrances: MapFeaturePoint[]; loadingDocks: MapFeaturePoint[] } {
  const points: MapPoint[] = []
  const roads: MapRoad[] = []
  const polygons: MapPolygon[] = []
  const entrances: MapFeaturePoint[] = []
  const loadingDocks: MapFeaturePoint[] = []

  for (const entity of Object.values(entitiesById)) {
    if (entity.entity_type === 'building' || entity.entity_type === 'space') {
      const resolved = resolveLocation(entitiesById, locationsById, entity.entity_id)
      if (resolved) {
        points.push({
          id: entity.entity_id,
          name: entity.name,
          entityType: entity.entity_type,
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          own: resolved.own,
        })
      }
      if (resolved?.own && entity.world_location_id) {
        const location = locationsById[entity.world_location_id]
        if (location) {
          const polygon = getPolygon(location)
          if (polygon) {
            const positions: [number, number][] = polygon.map(([lat, lon]) => [lon, lat])
            // Closed ring: GeoJSON Polygons require the first and last
            // position to match; Nominatim's own rings already do, but
            // don't assume every future source will.
            const first = positions[0]
            const last = positions[positions.length - 1]
            if (first[0] !== last[0] || first[1] !== last[1]) positions.push(first)
            polygons.push({ id: entity.entity_id, name: entity.name, entityType: entity.entity_type, positions })
          }
          getEntrances(location).forEach((p, i) => {
            entrances.push({
              id: `${entity.entity_id}:${i}`, entityId: entity.entity_id, label: p.label,
              longitude: p.longitude, latitude: p.latitude,
            })
          })
          getLoadingDocks(location).forEach((p, i) => {
            loadingDocks.push({
              id: `${entity.entity_id}:${i}`, entityId: entity.entity_id, label: p.label,
              longitude: p.longitude, latitude: p.latitude,
            })
          })
        }
      }
      continue
    }

    if (entity.entity_type === 'street') {
      const positions: [number, number][] = []
      for (const childId of entity.child_ids) {
        const child = entitiesById[childId]
        if (child?.entity_type !== 'building') continue
        const resolved = resolveLocation(entitiesById, locationsById, childId)
        if (resolved) positions.push([resolved.longitude, resolved.latitude])
      }
      if (positions.length >= 2) {
        roads.push({ id: entity.entity_id, name: entity.name, positions })
      }
    }
  }

  return { points, roads, polygons, entrances, loadingDocks }
}
