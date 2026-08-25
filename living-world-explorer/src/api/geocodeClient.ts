// Real geocoding — OpenStreetMap's free, no-API-key Nominatim search.
// Called directly from the browser (not proxied through our backend):
// this is a lookup against a public third-party service, not our own
// data, so there's nothing for our API to add by sitting in the middle.
// Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
// caps free use at ~1 request/second — callers of search() are
// responsible for debouncing/only searching on explicit submit, not
// on every keystroke.
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'

export interface NominatimAddress {
  house_number?: string
  road?: string
  neighbourhood?: string
  suburb?: string
  city?: string
  town?: string
  village?: string
  county?: string
  state?: string
  postcode?: string
  country?: string
  country_code?: string
}

interface NominatimGeoJSON {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon' | string
  coordinates: unknown
}

export interface GeocodeResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address: NominatimAddress
  osm_type?: string
  // Present only when polygon_geojson=1 is requested. Real building/way
  // geometry when Nominatim has it (osm_type "way"/"relation") — for a
  // plain street address (osm_type "node") this is just a Point,
  // duplicating lat/lon, not a real footprint. See extractPolygon().
  geojson?: NominatimGeoJSON
}

export async function searchAddress(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const url = `${NOMINATIM_BASE}/search?format=jsonv2&addressdetails=1&polygon_geojson=1&limit=5&q=${encodeURIComponent(trimmed)}`
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Nominatim search failed: ${res.status}`)
  return (await res.json()) as GeocodeResult[]
}

/** Real footprint only — [lat, lon][], our storage convention (Nominatim
 * itself uses [lon, lat], GeoJSON order). Returns null for a Point (no
 * real footprint mapped) or a LineString (a real feature, e.g. a
 * bridge, but not an enclosed area) — never fabricates a shape for an
 * address that doesn't have one. MultiPolygon uses its first ring only
 * (good enough for display; a real multi-part footprint is rare for a
 * single building/space). */
export function extractPolygon(result: GeocodeResult): [number, number][] | null {
  const geo = result.geojson
  if (!geo) return null
  if (geo.type === 'Polygon') {
    const rings = geo.coordinates as [number, number][][]
    const ring = rings[0]
    if (!ring || ring.length < 3) return null
    return ring.map(([lon, lat]) => [lat, lon])
  }
  if (geo.type === 'MultiPolygon') {
    const polygons = geo.coordinates as [number, number][][][]
    const ring = polygons[0]?.[0]
    if (!ring || ring.length < 3) return null
    return ring.map(([lon, lat]) => [lat, lon])
  }
  return null
}

export interface ParsedAddressComponents {
  country: string
  state: string
  county: string
  city: string
  street: string
  buildingName: string
}

/** Maps Nominatim's loose address breakdown onto our rigid 8-tier
 * hierarchy's vocabulary — city/town/village all mean "City" tier here;
 * whichever one Nominatim actually returned for this result wins. */
export function parseAddressComponents(result: GeocodeResult): ParsedAddressComponents {
  const a = result.address
  const city = a.city || a.town || a.village || a.suburb || ''
  const street = a.road || ''
  const buildingName = [a.house_number, a.road].filter(Boolean).join(' ') || street || city
  return {
    country: a.country || '',
    state: a.state || '',
    county: a.county || '',
    city,
    street,
    buildingName,
  }
}
