// Mapillary Graph API v4 — real, crowd-sourced street-level photos
// (the free/open equivalent of Google Street View). Requires a free
// access token from https://www.mapillary.com/dashboard/developers
// (a "Client Token", looks like "MLY|..."), set as VITE_MAPILLARY_TOKEN.
// Unset, Street View stays disabled rather than silently doing nothing.
const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_TOKEN as string | undefined

export function isMapillaryConfigured(): boolean {
  return !!MAPILLARY_TOKEN
}

export interface MapillaryImage {
  id: string
  thumbUrl: string
  capturedAt: number | null
  compassAngle: number | null
  longitude: number
  latitude: number
  distanceMeters: number
}

interface MapillaryApiImage {
  id: string
  thumb_1024_url?: string
  captured_at?: number
  compass_angle?: number
  geometry?: { type: 'Point'; coordinates: [number, number] }
}

interface MapillaryApiResponse {
  data: MapillaryApiImage[]
}

function bboxAround(lat: number, lon: number, radiusMeters: number): string {
  const latDelta = radiusMeters / 111_320
  const lonDelta = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180))
  return [lon - lonDelta, lat - latDelta, lon + lonDelta, lat + latDelta].join(',')
}

// Real great-circle distance, meters — used to rank Mapillary's bbox
// results by actual proximity to the clicked point (the API returns
// everything in the box, unsorted).
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Finds the real Mapillary image whose captured position is nearest to
// (lat, lon), within radiusMeters. Coverage is crowd-sourced and often
// incomplete — returning null (no imagery found) is an expected,
// honest outcome, not an error.
export async function fetchNearestStreetImage(
  lat: number,
  lon: number,
  radiusMeters = 75,
): Promise<MapillaryImage | null> {
  if (!MAPILLARY_TOKEN) {
    throw new Error('VITE_MAPILLARY_TOKEN is not set — Street View needs a free Mapillary access token.')
  }
  const bbox = bboxAround(lat, lon, radiusMeters)
  const params = new URLSearchParams({
    access_token: MAPILLARY_TOKEN,
    fields: 'id,thumb_1024_url,captured_at,compass_angle,geometry',
    bbox,
    limit: '20',
  })
  const res = await fetch(`https://graph.mapillary.com/images?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Mapillary request failed: ${res.status} ${res.statusText}`)
  }
  const body = (await res.json()) as MapillaryApiResponse
  let nearest: MapillaryImage | null = null
  for (const img of body.data ?? []) {
    if (!img.geometry || !img.thumb_1024_url) continue
    const [ilon, ilat] = img.geometry.coordinates
    const distanceMeters = haversineMeters(lat, lon, ilat, ilon)
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = {
        id: img.id,
        thumbUrl: img.thumb_1024_url,
        capturedAt: img.captured_at ?? null,
        compassAngle: img.compass_angle ?? null,
        longitude: ilon,
        latitude: ilat,
        distanceMeters,
      }
    }
  }
  return nearest
}
