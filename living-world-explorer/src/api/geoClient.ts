import { apiClient } from './client'

// Mirrors GeographicEntityType (kernel/geography/entity.py) exactly —
// Planet -> Country -> State -> County -> City -> Street -> Building
// -> Space, the one hierarchy this tree renders.
export type GeoEntityType =
  | 'planet'
  | 'country'
  | 'state'
  | 'county'
  | 'city'
  | 'street'
  | 'building'
  | 'space'

export interface GeoEntity {
  entity_id: string
  entity_type: GeoEntityType
  name: string
  description: string
  parent_id: string | null
  child_ids: string[]
  hosted_society_ids: string[]
  world_location_id: string | null
  metadata: Record<string, unknown>
  created_at: number
}

// GET /planet/geo returns every geographic entity as a flat list (each
// entity carries its own parent_id/child_ids) — the tree is built
// client-side from this one call, not fetched level-by-level.
export function fetchGeoEntities(): Promise<GeoEntity[]> {
  return apiClient.request<GeoEntity[]>('/planet/geo')
}

// Mirrors kernel/society/world.py::WorldLocation.to_dict() — real
// latitude/longitude, the thing GeoEntity.world_location_id points at.
export interface WorldLocation {
  location_id: string
  name: string
  address: string
  latitude: number
  longitude: number
  attributes: Record<string, unknown>
  version: number
}

interface WorldLocationsResponse {
  locations: WorldLocation[]
  count: number
}

export async function fetchWorldLocations(): Promise<WorldLocation[]> {
  const res = await apiClient.request<WorldLocationsResponse>('/world/locations')
  return res.locations
}

// WorldLocation.attributes is free-form (kernel/society/world.py never
// added dedicated fields for these) — these are our own conventions on
// top of it: attributes.polygon = [lat, lon][] (real footprint, e.g.
// from Nominatim's polygon_geojson), attributes.entrances/
// attributes.loading_docks = named point features on that footprint.
// Validated defensively (this is free-form, API-writable data, not a
// typed backend field) rather than trusted blindly.
export interface NamedPoint {
  label: string
  latitude: number
  longitude: number
}

function isLatLonPair(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number'
}

export function getPolygon(location: WorldLocation): [number, number][] | null {
  const raw = location.attributes?.polygon
  if (!Array.isArray(raw) || raw.length < 3 || !raw.every(isLatLonPair)) return null
  return raw as [number, number][]
}

function getNamedPoints(location: WorldLocation, key: 'entrances' | 'loading_docks'): NamedPoint[] {
  const raw = location.attributes?.[key]
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (p): p is NamedPoint =>
      typeof p === 'object' && p !== null &&
      typeof (p as NamedPoint).latitude === 'number' && typeof (p as NamedPoint).longitude === 'number',
  )
}

export function getEntrances(location: WorldLocation): NamedPoint[] {
  return getNamedPoints(location, 'entrances')
}

export function getLoadingDocks(location: WorldLocation): NamedPoint[] {
  return getNamedPoints(location, 'loading_docks')
}

// PUT /world/locations/{id} merges `attributes` by top-level key
// (confirmed live: sending one key leaves sibling keys untouched,
// overwrites only a matching key) — callers still pass the FULL
// desired value for whichever key they're changing (e.g. the whole
// entrances array, not one entry), since the merge is shallow, one
// level deep, not recursive into array/object values.
export function updateWorldLocationAttributes(
  locationId: string, attributes: Record<string, unknown>,
): Promise<WorldLocation> {
  return apiClient.request<WorldLocation>(`/world/locations/${locationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributes }),
  })
}

export interface CreateGeoFromAddressBody {
  country: string
  state?: string
  county?: string
  city?: string
  street?: string
  building_name?: string
  latitude: number
  longitude: number
  display_address?: string
  attributes?: Record<string, unknown>
}

// POST /planet/geo/from-address — finds-or-creates the real Country/
// State/County/City/Street chain (reusing existing tiers by name) and
// creates a new Building linked to a real WorldLocation. Returns the
// created Building.
export function createGeoFromAddress(body: CreateGeoFromAddressBody): Promise<GeoEntity> {
  return apiClient.request<GeoEntity>('/planet/geo/from-address', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
