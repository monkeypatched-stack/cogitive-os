import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection, LineString, Point, Polygon } from 'geojson'
import { useWorldStore } from '../../store/worldStore'
import { useCycleStore } from '../../store/cycleStore'
import { buildMapData, buildActorMapData, type MapFeaturePoint, type ActorMapPoint } from './mapUtils'
import { updateWorldLocationAttributes, getEntrances, getLoadingDocks } from '../../api/geoClient'
import { fetchNearestStreetImage, isMapillaryConfigured, type MapillaryImage } from '../../api/mapillaryClient'
import { fetchActorTimeline } from '../../api/actorClient'
import './MapView.css'

// A real style URL (vector, e.g. from a hosted provider) overrides the
// default below — set VITE_MAPLIBRE_STYLE_URL for that. Unset, this
// falls back to the actual OpenStreetMap.org raster tiles (real street-
// level detail: roads, buildings, place labels — MapLibre's own
// demotiles.maplibre.org style used through Prompt 4 only has country-
// level land polygons, no streets at all). tile.openstreetmap.org's own
// usage policy (https://operations.osmfoundation.org/policies/tiles/)
// is explicit that this is for light/evaluation use, not production
// traffic — a real constraint, not a formality; swap in a real style
// URL (self-hosted, or a provider like MapTiler/Stadia/Mapbox) before
// this app sees meaningful traffic. Real attribution is required by
// that same policy and is wired below, not omitted.
const STYLE_URL = import.meta.env.VITE_MAPLIBRE_STYLE_URL as string | undefined

const OSM_RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }],
}

const POINTS_SOURCE = 'lwe-points'
const ROADS_SOURCE = 'lwe-roads'
const POLYGONS_SOURCE = 'lwe-polygons'
const FEATURES_SOURCE = 'lwe-features'
const ACTORS_SOURCE = 'lwe-actors'
const PULSES_SOURCE = 'lwe-pulses'
const ARCS_SOURCE = 'lwe-arcs'

// How long a single ripple/arc stays visible, and how far apart (ms)
// consecutive real events are staggered — the stagger is what makes a
// cycle read as propagation rippling across the map in the real order
// events actually happened, instead of everything flashing at once.
const PULSE_DURATION_MS = 1300
const ARC_DURATION_MS = 1100
const PROPAGATION_STAGGER_MS = 90

interface PulseFeatureData {
  id: string
  kind: 'context' | 'execution'
  lng: number
  lat: number
  spawnDelay: number
}

interface ArcFeatureData {
  id: string
  from: [number, number]
  to: [number, number]
  spawnDelay: number
}

type AddMode = 'entrance' | 'loading_dock' | null

function pointsToGeoJSON(
  points: ReturnType<typeof buildMapData>['points'],
  selectedId: string | null,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      properties: {
        id: p.id,
        name: p.name,
        entityType: p.entityType,
        own: p.own,
        selected: p.id === selectedId,
      },
    })),
  }
}

function roadsToGeoJSON(roads: ReturnType<typeof buildMapData>['roads']): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: roads.map((r) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: r.positions },
      properties: { id: r.id, name: r.name },
    })),
  }
}

function featuresToGeoJSON(
  entrances: MapFeaturePoint[],
  loadingDocks: MapFeaturePoint[],
): FeatureCollection<Point> {
  const features = [
    ...entrances.map((f) => ({ ...f, featureType: 'entrance' as const })),
    ...loadingDocks.map((f) => ({ ...f, featureType: 'loading_dock' as const })),
  ]
  return {
    type: 'FeatureCollection',
    features: features.map((f) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [f.longitude, f.latitude] },
      properties: { id: f.id, entityId: f.entityId, label: f.label, featureType: f.featureType },
    })),
  }
}

function polygonsToGeoJSON(
  polygons: ReturnType<typeof buildMapData>['polygons'],
  selectedId: string | null,
): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: polygons.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [p.positions] },
      properties: { id: p.id, name: p.name, entityType: p.entityType, selected: p.id === selectedId },
    })),
  }
}

function pulsesToGeoJSON(pulses: Array<{ kind: PulseFeatureData['kind']; lng: number; lat: number; progress: number }>): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: pulses.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { kind: p.kind, progress: p.progress },
    })),
  }
}

function arcsToGeoJSON(arcs: Array<{ from: [number, number]; to: [number, number]; progress: number }>): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: arcs.map((a) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [a.from, a.to] },
      properties: { progress: a.progress },
    })),
  }
}

function actorsToGeoJSON(actors: ActorMapPoint[], selectedActorId: string | null, highlightedActorIds: Set<string>): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: actors.map((actor) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [actor.longitude, actor.latitude] },
      properties: {
        id: actor.id, name: actor.name, role: actor.role, status: actor.status,
        locationLabel: actor.locationLabel, directlyLocated: actor.directlyLocated,
        selected: actor.id === selectedActorId,
        highlighted: highlightedActorIds.has(actor.id),
      },
    })),
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const hasFitBoundsRef = useRef(false)
  const lastFocusedIdRef = useRef<string | null>(null)
  // Mirrors addMode for the map-init effect's closures (that effect
  // runs once, with [] deps — a ref is how it reads a value that
  // changes after mount without going stale).
  const addModeRef = useRef<AddMode>(null)
  const streetViewModeRef = useRef(false)

  const entitiesById = useWorldStore((s) => s.entitiesById)
  const locationsById = useWorldStore((s) => s.locationsById)
  const selectedEntityId = useWorldStore((s) => s.selectedEntityId)
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const highlightedActorIds = useWorldStore((s) => s.highlightedActorIds)
  const selectEntity = useWorldStore((s) => s.selectEntity)
  const selectActor = useWorldStore((s) => s.selectActor)
  const loading = useWorldStore((s) => s.loading)
  const fetchEntities = useWorldStore((s) => s.fetchEntities)
  const actorsById = useWorldStore((s) => s.actorsById)
  const occupancyByActorId = useWorldStore((s) => s.occupancyByActorId)
  const rawEntitiesById = useWorldStore((s) => s.rawEntitiesById)
  const societyToEntityId = useWorldStore((s) => s.societyToEntityId)
  const actorPositionsRef = useRef<Record<string, [number, number]>>({})
  const actorAnimationRef = useRef<number | null>(null)
  const pulseAnimationRef = useRef<number | null>(null)

  const tickSeq = useCycleStore((s) => s.tickSeq)

  const [addMode, setAddMode] = useState<AddMode>(null)
  const [pendingPoint, setPendingPoint] = useState<{ lng: number; lat: number } | null>(null)
  const [labelInput, setLabelInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [streetViewMode, setStreetViewMode] = useState(false)
  const [streetView, setStreetView] = useState<
    | { status: 'loading'; lng: number; lat: number }
    | { status: 'found'; image: MapillaryImage }
    | { status: 'empty'; lng: number; lat: number }
    | { status: 'error'; message: string }
    | null
  >(null)

  useEffect(() => {
    addModeRef.current = addMode
  }, [addMode])

  useEffect(() => {
    streetViewModeRef.current = streetViewMode
  }, [streetViewMode])

  const queryStreetView = async (lng: number, lat: number) => {
    setStreetView({ status: 'loading', lng, lat })
    try {
      const image = await fetchNearestStreetImage(lat, lng)
      setStreetView(image ? { status: 'found', image } : { status: 'empty', lng, lat })
    } catch (err) {
      setStreetView({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const selectedEntity = selectedEntityId ? entitiesById[selectedEntityId] : null
  const canAddFeatures =
    !!selectedEntity &&
    (selectedEntity.entity_type === 'building' || selectedEntity.entity_type === 'space') &&
    !!selectedEntity.world_location_id

  const savePendingPoint = async () => {
    if (!pendingPoint || !selectedEntity?.world_location_id || !addMode || !labelInput.trim()) return
    const location = locationsById[selectedEntity.world_location_id]
    if (!location) return
    setSaving(true)
    setSaveError('')
    try {
      const key = addMode === 'entrance' ? 'entrances' : 'loading_docks'
      const existing = addMode === 'entrance' ? getEntrances(location) : getLoadingDocks(location)
      const merged = {
        ...location.attributes,
        [key]: [...existing, { label: labelInput.trim(), latitude: pendingPoint.lat, longitude: pendingPoint.lng }],
      }
      await updateWorldLocationAttributes(selectedEntity.world_location_id, merged)
      await fetchEntities()
      setPendingPoint(null)
      setLabelInput('')
      setAddMode(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  // Map instance: created once, destroyed on unmount.
  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL ?? OSM_RASTER_STYLE,
      center: [0, 20],
      zoom: 1.5,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({}), 'top-right')

    // MapLibre measures its container once, at construction. It has no
    // idea react-resizable-panels' flex layout settles asynchronously
    // (and can change any time the user drags a divider) — without this,
    // the map's internal WebGL drawing buffer stays locked to whatever
    // tiny size the container happened to be on the first paint.
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)

    map.on('load', () => {
      // Real footprints only (buildMapData already excludes inherited/
      // fabricated shapes) — added first so it renders under the roads
      // and point layers below it.
      map.addSource(POLYGONS_SOURCE, { type: 'geojson', data: polygonsToGeoJSON([], null) })
      map.addLayer({
        id: 'lwe-polygons-fill-layer',
        type: 'fill',
        source: POLYGONS_SOURCE,
        paint: {
          'fill-color': ['case', ['get', 'selected'], '#3363ff', '#e0793c'],
          'fill-opacity': ['case', ['get', 'selected'], 0.35, 0.2],
        },
      })
      map.addLayer({
        id: 'lwe-polygons-outline-layer',
        type: 'line',
        source: POLYGONS_SOURCE,
        paint: {
          'line-color': ['case', ['get', 'selected'], '#3363ff', '#e0793c'],
          'line-width': ['case', ['get', 'selected'], 3, 1.5],
        },
      })

      map.addSource(ROADS_SOURCE, { type: 'geojson', data: roadsToGeoJSON([]) })
      map.addLayer({
        id: 'lwe-roads-layer',
        type: 'line',
        source: ROADS_SOURCE,
        paint: { 'line-color': '#8a8f99', 'line-width': 3 },
      })

      map.addSource(POINTS_SOURCE, { type: 'geojson', data: pointsToGeoJSON([], null) })
      map.addLayer({
        id: 'lwe-buildings-layer',
        type: 'circle',
        source: POINTS_SOURCE,
        filter: ['==', ['get', 'entityType'], 'building'],
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 10, 7],
          'circle-color': ['case', ['get', 'selected'], '#3363ff', '#e0793c'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'lwe-spaces-layer',
        type: 'circle',
        source: POINTS_SOURCE,
        filter: ['==', ['get', 'entityType'], 'space'],
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 8, 5],
          'circle-color': ['case', ['get', 'selected'], '#3363ff', '#37c96b'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          // Spaces inheriting their Building's position (no location of
          // their own yet) render lower-opacity — real position, but
          // honestly flagged as not this entity's own coordinate.
          'circle-opacity': ['case', ['get', 'own'], 1, 0.55],
        },
      })

      map.addSource(FEATURES_SOURCE, { type: 'geojson', data: featuresToGeoJSON([], []) })
      map.addLayer({
        id: 'lwe-entrances-layer',
        type: 'circle',
        source: FEATURES_SOURCE,
        filter: ['==', ['get', 'featureType'], 'entrance'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#14b8a6',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      map.addSource(ACTORS_SOURCE, { type: 'geojson', data: actorsToGeoJSON([], null, new Set()) })
      map.addLayer({
        id: 'lwe-actors-layer', type: 'circle', source: ACTORS_SOURCE,
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 11, ['get', 'highlighted'], 10, 8],
          'circle-color': ['case', ['get', 'selected'], '#ffffff', ['get', 'highlighted'], '#f59e0b', '#8b5cf6'],
          'circle-stroke-width': ['case', ['get', 'selected'], 4, ['get', 'highlighted'], 3, 2],
          'circle-stroke-color': ['case', ['get', 'selected'], '#8b5cf6', ['get', 'highlighted'], '#fff7ed', '#ffffff'],
          'circle-opacity': ['case', ['get', 'directlyLocated'], 1, 0.58],
        },
      })
      map.addLayer({
        id: 'lwe-actors-label-layer', type: 'symbol', source: ACTORS_SOURCE,
        layout: {
          'text-field': ['concat', ['get', 'name'], ' · ', ['get', 'role'], ' · ', ['get', 'status']],
          'text-size': 11, 'text-offset': [0, 1.35],
          'text-anchor': 'top', 'text-allow-overlap': false,
        },
        paint: { 'text-color': '#4c1d95', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      })
      map.addLayer({
        id: 'lwe-loading-docks-layer',
        type: 'circle',
        source: FEATURES_SOURCE,
        filter: ['==', ['get', 'featureType'], 'loading_dock'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#f5a524',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      // Planetary Cycle Animation: real Context Stream events (society
      // coordination arcs, context-propagation/execution ripples) drawn
      // on top of everything else so a tick reads clearly against the
      // static geography underneath it.
      map.addSource(ARCS_SOURCE, { type: 'geojson', data: arcsToGeoJSON([]) })
      map.addLayer({
        id: 'lwe-arcs-layer', type: 'line', source: ARCS_SOURCE,
        paint: {
          'line-color': '#f59e0b',
          'line-width': 2.5,
          'line-opacity': ['interpolate', ['linear'], ['get', 'progress'], 0, 0.9, 1, 0],
        },
      })
      map.addSource(PULSES_SOURCE, { type: 'geojson', data: pulsesToGeoJSON([]) })
      map.addLayer({
        id: 'lwe-pulses-layer', type: 'circle', source: PULSES_SOURCE,
        paint: {
          // Expanding, fading ring rather than a filled dot — a "ripple"
          // reads as one real event's effect spreading outward, which a
          // static dot doesn't.
          'circle-radius': ['interpolate', ['linear'], ['get', 'progress'], 0, 6, 1, 26],
          'circle-opacity': 0,
          'circle-stroke-width': ['interpolate', ['linear'], ['get', 'progress'], 0, 3, 1, 0.5],
          'circle-stroke-color': ['case', ['==', ['get', 'kind'], 'execution'], '#22c55e', '#3363ff'],
          'circle-stroke-opacity': ['interpolate', ['linear'], ['get', 'progress'], 0, 0.9, 1, 0],
        },
      })

      for (const layerId of ['lwe-buildings-layer', 'lwe-spaces-layer', 'lwe-polygons-fill-layer']) {
        map.on('click', layerId, (e: MapLayerMouseEvent) => {
          // While arming an entrance/loading-dock placement or Street
          // View, a click means "place it here" / "look up imagery
          // here," not "select this" — even if it happens to land on a
          // marker/polygon underneath.
          if (addModeRef.current || streetViewModeRef.current) return
          const id = e.features?.[0]?.properties?.id
          if (id) selectEntity(id)
        })
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      map.on('click', 'lwe-actors-layer', (e) => {
        if (addModeRef.current || streetViewModeRef.current) return
        const id = e.features?.[0]?.properties?.id
        if (id) selectActor(id)
      })
      map.on('click', 'lwe-actors-label-layer', (e) => {
        if (addModeRef.current || streetViewModeRef.current) return
        const id = e.features?.[0]?.properties?.id
        if (id) selectActor(id)
      })
      for (const layerId of ['lwe-actors-layer', 'lwe-actors-label-layer']) {
        map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })
      }

      // General click (fires alongside any layer-specific handler above)
      // — the real placement mechanism for entrances/loading docks.
      map.on('click', (e) => {
        if (!addModeRef.current) return
        setPendingPoint({ lng: e.lngLat.lng, lat: e.lngLat.lat })
      })

      // Street View: click anywhere on the map to look up the nearest
      // real Mapillary street-level photo to that point.
      map.on('click', (e) => {
        if (!streetViewModeRef.current) return
        queryStreetView(e.lngLat.lng, e.lngLat.lat)
      })
    })

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      hasFitBoundsRef.current = false
      lastFocusedIdRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Data sync: rebuild GeoJSON whenever the tree/locations/selection
  // change. Guarded on map+style being ready since fetchEntities() can
  // resolve before MapLibre's own async 'load' event fires.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const apply = () => {
      const { points, roads, polygons, entrances, loadingDocks } = buildMapData(entitiesById, locationsById)
      const pointsSource = map.getSource(POINTS_SOURCE) as GeoJSONSource | undefined
      const roadsSource = map.getSource(ROADS_SOURCE) as GeoJSONSource | undefined
      const polygonsSource = map.getSource(POLYGONS_SOURCE) as GeoJSONSource | undefined
      const featuresSource = map.getSource(FEATURES_SOURCE) as GeoJSONSource | undefined
      if (!pointsSource || !roadsSource || !polygonsSource || !featuresSource) return

      pointsSource.setData(pointsToGeoJSON(points, selectedEntityId))
      roadsSource.setData(roadsToGeoJSON(roads))
      polygonsSource.setData(polygonsToGeoJSON(polygons, selectedEntityId))
      featuresSource.setData(featuresToGeoJSON(entrances, loadingDocks))

      if (!hasFitBoundsRef.current && points.length > 0) {
        const bounds = new maplibregl.LngLatBounds()
        for (const p of points) bounds.extend([p.longitude, p.latitude])
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 })
        hasFitBoundsRef.current = true
        lastFocusedIdRef.current = selectedEntityId
        return
      }

      // Focus follows selection (Buildings and Spaces alike): a newly
      // selected entity's own footprint if it has one, otherwise just
      // its resolved point — the same position already used to render
      // its marker, own or inherited from its Building.
      if (selectedEntityId && selectedEntityId !== lastFocusedIdRef.current) {
        const polygon = polygons.find((p) => p.id === selectedEntityId)
        if (polygon) {
          const bounds = new maplibregl.LngLatBounds()
          for (const pos of polygon.positions) bounds.extend(pos)
          map.fitBounds(bounds, { padding: 80, maxZoom: 19, duration: 800 })
        } else {
          const point = points.find((p) => p.id === selectedEntityId)
          if (point) {
            map.flyTo({
              center: [point.longitude, point.latitude],
              zoom: Math.max(map.getZoom(), 17),
              duration: 800,
            })
          }
        }
      }
      lastFocusedIdRef.current = selectedEntityId
    }

    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [entitiesById, locationsById, selectedEntityId, selectedActorId])

  // Actor positions come from current presence and may change independently
  // of the geography. Interpolate the marker between the last and next real
  // coordinates so a movement event reads as movement rather than a teleport.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const actors = buildActorMapData(actorsById, occupancyByActorId, rawEntitiesById, locationsById, societyToEntityId)
    const source = map.getSource(ACTORS_SOURCE) as GeoJSONSource | undefined
    if (!source) return
    if (actorAnimationRef.current !== null) cancelAnimationFrame(actorAnimationRef.current)
    const start = performance.now()
    const duration = 700
    const previous = actorPositionsRef.current
    const target: Record<string, [number, number]> = {}
    for (const actor of actors) target[actor.id] = [actor.longitude, actor.latitude]
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const frameActors = actors.map((actor) => {
        const from = previous[actor.id] || target[actor.id]
        return { ...actor, longitude: from[0] + (target[actor.id][0] - from[0]) * progress, latitude: from[1] + (target[actor.id][1] - from[1]) * progress }
      })
      source.setData(actorsToGeoJSON(frameActors, selectedActorId, highlightedActorIds))
      if (progress < 1) actorAnimationRef.current = requestAnimationFrame(frame)
      else actorAnimationRef.current = null
    }
    actorPositionsRef.current = target
    if (map.isStyleLoaded()) frame(start)
    else map.once('load', () => frame(performance.now()))
    return () => { if (actorAnimationRef.current !== null) cancelAnimationFrame(actorAnimationRef.current) }
  }, [actorsById, occupancyByActorId, rawEntitiesById, locationsById, societyToEntityId, selectedActorId, highlightedActorIds])

  // Runs the ripple/arc animation for one already-gathered batch of real
  // propagation events. Each feature's own spawnDelay staggers it behind
  // the last — a single rAF loop drives the whole batch, computing every
  // active feature's progress fresh each frame (same pattern as the
  // actor-movement interpolation above), instead of one timer per event.
  const runPropagationAnimation = (pulses: PulseFeatureData[], arcs: ArcFeatureData[]) => {
    const map = mapRef.current
    if (!map) return
    const pulsesSource = map.getSource(PULSES_SOURCE) as GeoJSONSource | undefined
    const arcsSource = map.getSource(ARCS_SOURCE) as GeoJSONSource | undefined
    if (!pulsesSource || !arcsSource) return
    if (pulseAnimationRef.current !== null) cancelAnimationFrame(pulseAnimationRef.current)

    const start = performance.now()
    const frame = (now: number) => {
      const elapsed = now - start
      let anyPending = false
      const activePulses: Array<{ kind: PulseFeatureData['kind']; lng: number; lat: number; progress: number }> = []
      for (const p of pulses) {
        const local = elapsed - p.spawnDelay
        if (local < 0) { anyPending = true; continue }
        if (local >= PULSE_DURATION_MS) continue
        anyPending = true
        activePulses.push({ kind: p.kind, lng: p.lng, lat: p.lat, progress: local / PULSE_DURATION_MS })
      }
      const activeArcs: Array<{ from: [number, number]; to: [number, number]; progress: number }> = []
      for (const a of arcs) {
        const local = elapsed - a.spawnDelay
        if (local < 0) { anyPending = true; continue }
        if (local >= ARC_DURATION_MS) continue
        anyPending = true
        activeArcs.push({ from: a.from, to: a.to, progress: local / ARC_DURATION_MS })
      }
      pulsesSource.setData(pulsesToGeoJSON(activePulses))
      arcsSource.setData(arcsToGeoJSON(activeArcs))
      if (anyPending) pulseAnimationRef.current = requestAnimationFrame(frame)
      else pulseAnimationRef.current = null
    }
    pulseAnimationRef.current = requestAnimationFrame(frame)
  }

  // Planetary Cycle Animation (Prompt 11): a real tick (Toolbar's
  // "Planetary Tick" button, via cycleStore) drives all five things —
  // refetching entities/occupancy resurfaces any real actor movement
  // through the interpolation effect above; the real Context Stream
  // events this cycle just published (OBSERVATION/BELIEF_UPDATE ->
  // context propagation, INTERACTION -> society coordination arcs) and
  // any actor that got a new real timeline entry (-> execution) get
  // rendered as a staggered, real-chronological-order ripple sequence
  // so propagation is genuinely visible, not just a single flash.
  useEffect(() => {
    if (tickSeq === 0) return // skip the initial mount — only react to real ticks
    let cancelled = false

    const run = async () => {
      const { tickStartedAt } = useCycleStore.getState()
      if (tickStartedAt === null) return

      // Movement first: a tick can trigger evacuation/movement
      // perturbations, and the interpolation effect above only animates
      // a change once fresh occupancy data actually arrives.
      await fetchEntities()
      if (cancelled) return

      try {
        // Already fetched once, centrally, by cycleStore.triggerTick()
        // (real, deduped, chronologically-sorted context events this
        // cycle published) — the Society panel reads the same batch to
        // derive its own "just coordinated" highlight, so this doesn't
        // re-fetch it a second time per tick.
        const newEvents = useCycleStore.getState().lastEvents

        const pulses: PulseFeatureData[] = []
        const arcs: ArcFeatureData[] = []
        let step = 0

        for (const event of newEvents) {
          const eventType = String(event.event_type || '').toLowerCase()
          const fromPos = event.actor_id ? actorPositionsRef.current[event.actor_id] : undefined
          if (!fromPos) continue
          const spawnDelay = step * PROPAGATION_STAGGER_MS
          step += 1

          if (eventType === 'interaction') {
            const participants = (event.payload as { participants?: string[] } | undefined)?.participants ?? []
            for (const participantId of participants) {
              const toPos = actorPositionsRef.current[participantId]
              if (toPos && participantId !== event.actor_id) {
                arcs.push({
                  id: `${event.event_id}:${participantId}`, from: fromPos, to: toPos, spawnDelay,
                })
              }
            }
          }
          // Every real event (interaction included) pulses at its own
          // actor — an interaction is still that actor's context event.
          pulses.push({
            id: event.event_id ?? `${event.actor_id}:${event.timestamp}`,
            kind: 'context', lng: fromPos[0], lat: fromPos[1], spawnDelay,
          })
        }

        // Execution: actors this cycle observed that also picked up a
        // real, new timeline entry — a plan/outcome actually landing,
        // not just belief bookkeeping.
        const observedActorIds = Array.from(
          new Set(newEvents.map((event) => event.actor_id).filter((id): id is string => !!id)),
        )
        const timelineResults = await Promise.allSettled(observedActorIds.map((id) => fetchActorTimeline(id)))
        if (cancelled) return
        timelineResults.forEach((result, index) => {
          if (result.status !== 'fulfilled') return
          const actorId = observedActorIds[index]
          const hasNewEntry = result.value.some((entry) => (entry.start_time ?? 0) >= tickStartedAt)
          const pos = actorPositionsRef.current[actorId]
          if (hasNewEntry && pos) {
            pulses.push({ id: `exec:${actorId}`, kind: 'execution', lng: pos[0], lat: pos[1], spawnDelay: step * PROPAGATION_STAGGER_MS })
            step += 1
          }
        })

        if (!cancelled) runPropagationAnimation(pulses, arcs)
      } catch {
        // Best-effort visualization on top of an already-succeeded real
        // tick (Toolbar already reported cycle_number/duration) — a
        // failed fetch here shouldn't surface as an app-level error.
      }
    }

    run()
    return () => {
      cancelled = true
      if (pulseAnimationRef.current !== null) cancelAnimationFrame(pulseAnimationRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickSeq])

  const { points } = buildMapData(entitiesById, locationsById)

  return (
    <div className="lwe-map">
      <div ref={containerRef} className="lwe-map-canvas" />
      {!loading && points.length === 0 && (
        <div className="lwe-map-empty">No located Buildings or Spaces yet.</div>
      )}

      <div className="lwe-map-streetview-toggle">
        <button
          type="button"
          className={streetViewMode ? 'lwe-map-toolbar-active' : ''}
          disabled={!isMapillaryConfigured()}
          title={
            isMapillaryConfigured()
              ? 'Click a point on the map to view real street-level imagery'
              : 'Set VITE_MAPILLARY_TOKEN (free at mapillary.com/dashboard/developers) to enable Street View'
          }
          onClick={() => {
            setStreetViewMode((v) => !v)
            setStreetView(null)
          }}
        >
          {streetViewMode ? 'Click map for Street View...' : '📷 Street View'}
        </button>
      </div>

      {streetView && (
        <div className="lwe-streetview-panel">
          {streetView.status === 'loading' && <div className="lwe-streetview-loading">Looking up street-level imagery...</div>}
          {streetView.status === 'error' && <div className="lwe-streetview-error">{streetView.message}</div>}
          {streetView.status === 'empty' && (
            <div className="lwe-streetview-empty">
              No Mapillary street-level imagery within 75m of this point.
              <br />
              (Coverage is crowd-sourced and incomplete — this is an honest gap, not an error.)
            </div>
          )}
          {streetView.status === 'found' && (
            <>
              <img src={streetView.image.thumbUrl} alt="Street-level view" className="lwe-streetview-image" />
              <div className="lwe-streetview-meta">
                <span>
                  {Math.round(streetView.image.distanceMeters)}m away
                  {streetView.image.capturedAt && ` · captured ${new Date(streetView.image.capturedAt).toLocaleDateString()}`}
                </span>
                <a
                  href={`https://www.mapillary.com/app/?pKey=${encodeURIComponent(streetView.image.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Mapillary
                </a>
              </div>
              <div className="lwe-streetview-attribution">Imagery &copy; Mapillary contributors</div>
            </>
          )}
          <button type="button" className="lwe-streetview-close" onClick={() => setStreetView(null)}>
            Close
          </button>
        </div>
      )}

      {canAddFeatures && !pendingPoint && (
        <div className="lwe-map-toolbar">
          <span className="lwe-map-toolbar-label">{selectedEntity!.name}:</span>
          <button
            type="button"
            className={addMode === 'entrance' ? 'lwe-map-toolbar-active' : ''}
            onClick={() => setAddMode(addMode === 'entrance' ? null : 'entrance')}
          >
            {addMode === 'entrance' ? 'Click map to place entrance...' : '+ Entrance'}
          </button>
          <button
            type="button"
            className={addMode === 'loading_dock' ? 'lwe-map-toolbar-active' : ''}
            onClick={() => setAddMode(addMode === 'loading_dock' ? null : 'loading_dock')}
          >
            {addMode === 'loading_dock' ? 'Click map to place loading dock...' : '+ Loading Dock'}
          </button>
        </div>
      )}

      {pendingPoint && (
        <div className="lwe-map-toolbar">
          <input
            type="text"
            autoFocus
            placeholder={addMode === 'entrance' ? 'Entrance label (e.g. "Main Entrance")' : 'Loading dock label (e.g. "Dock 1")'}
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') savePendingPoint()
              if (e.key === 'Escape') {
                setPendingPoint(null)
                setLabelInput('')
              }
            }}
          />
          <button type="button" onClick={savePendingPoint} disabled={saving || !labelInput.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingPoint(null)
              setLabelInput('')
            }}
          >
            Cancel
          </button>
          {saveError && <span className="lwe-map-toolbar-error">{saveError}</span>}
        </div>
      )}
    </div>
  )
}
