// Static (non-simulated) layout algorithms for the Ontology Explorer.
// Force-directed/Organic reuse useWorldSimulation (worldGraph.tsx) — these
// are the other modes: real positioning math, not hand-placed coordinates.
import type { AdjacencyIndex } from './algorithms'
import type { WNode } from './worldGraph'

export type LayoutMode = 'force' | 'organic' | 'circular' | 'radial' | 'hierarchical' | 'geographic'

export function circularLayout(nodeIds: string[], centerX: number, centerY: number, radius: number): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  nodeIds.forEach((id, i) => {
    const angle = (i / Math.max(nodeIds.length, 1)) * Math.PI * 2 - Math.PI / 2
    pos.set(id, { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius })
  })
  return pos
}

// BFS distance from a root determines the ring; nodes within a ring are
// spread evenly by angle. Unreachable nodes land on an outermost ring.
export function radialLayout(nodeIds: string[], rootId: string, adj: AdjacencyIndex, centerX: number, centerY: number, ringGap: number): Map<string, { x: number; y: number }> {
  const dist = new Map<string, number>([[rootId, 0]])
  const queue = [rootId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const next of adj.undirectedNeighbors.get(cur) ?? []) {
      if (dist.has(next)) continue
      dist.set(next, dist.get(cur)! + 1)
      queue.push(next)
    }
  }
  const maxKnown = Math.max(0, ...dist.values())
  const fallbackRing = maxKnown + 1
  const byRing = new Map<number, string[]>()
  for (const id of nodeIds) {
    const ring = dist.get(id) ?? fallbackRing
    if (!byRing.has(ring)) byRing.set(ring, [])
    byRing.get(ring)!.push(id)
  }
  const pos = new Map<string, { x: number; y: number }>()
  pos.set(rootId, { x: centerX, y: centerY })
  for (const [ring, ids] of byRing) {
    if (ring === 0) continue
    const radius = ring * ringGap
    ids.forEach((id, i) => {
      const angle = (i / Math.max(ids.length, 1)) * Math.PI * 2 - Math.PI / 2
      pos.set(id, { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius })
    })
  }
  return pos
}

// Layered top-down by BFS depth from a root (or from every source with
// in-degree 0 if no root given) — a real tree/DAG layering, the same
// shape a Neo4j Bloom "hierarchical" layout produces for a rooted graph.
export function hierarchicalLayout(nodeIds: string[], rootId: string, adj: AdjacencyIndex, width: number, layerGap: number, topY: number): Map<string, { x: number; y: number }> {
  const depth = new Map<string, number>([[rootId, 0]])
  const queue = [rootId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const next of adj.undirectedNeighbors.get(cur) ?? []) {
      if (depth.has(next)) continue
      depth.set(next, depth.get(cur)! + 1)
      queue.push(next)
    }
  }
  const maxKnown = Math.max(0, ...depth.values())
  const fallbackDepth = maxKnown + 1
  const byDepth = new Map<number, string[]>()
  for (const id of nodeIds) {
    const d = depth.get(id) ?? fallbackDepth
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(id)
  }
  const pos = new Map<string, { x: number; y: number }>()
  for (const [d, ids] of byDepth) {
    const gapX = width / Math.max(ids.length + 1, 2)
    ids.forEach((id, i) => pos.set(id, { x: gapX * (i + 1), y: topY + d * layerGap }))
  }
  return pos
}

// Real lat/lon for every node with a resolvable location (its own
// WorldLocation, or its nearest ancestor's via PART_OF/HOSTS/HAS_INVENTORY
// edges) — a simple equirectangular projection scaled around the world's
// own centroid, not a fabricated coordinate system. Nodes with no
// resolvable location at all are placed in a clearly-separated "unplaced"
// band rather than guessed at.
export function geographicLayout(
  nodeIds: string[], nodesById: Map<string, WNode>, adj: AdjacencyIndex,
  width: number, height: number,
): { positions: Map<string, { x: number; y: number }>; unplaced: string[] } {
  const resolved = new Map<string, { lat: number; lon: number }>()
  const cache = new Map<string, { lat: number; lon: number } | null>()

  function resolve(id: string, seen: Set<string>): { lat: number; lon: number } | null {
    if (cache.has(id)) return cache.get(id)!
    if (seen.has(id)) return null
    seen.add(id)
    const node = nodesById.get(id)
    if (node?.worldLocation) { cache.set(id, node.worldLocation); return node.worldLocation }
    for (const neighbor of adj.undirectedNeighbors.get(id) ?? []) {
      const loc = resolve(neighbor, seen)
      if (loc) { cache.set(id, loc); return loc }
    }
    cache.set(id, null)
    return null
  }

  const unplaced: string[] = []
  for (const id of nodeIds) {
    const loc = resolve(id, new Set())
    if (loc) resolved.set(id, loc); else unplaced.push(id)
  }

  const positions = new Map<string, { x: number; y: number }>()
  if (resolved.size > 0) {
    const lats = [...resolved.values()].map((l) => l.lat)
    const lons = [...resolved.values()].map((l) => l.lon)
    const latMin = Math.min(...lats), latMax = Math.max(...lats)
    const lonMin = Math.min(...lons), lonMax = Math.max(...lons)
    const latSpan = Math.max(latMax - latMin, 0.01)
    const lonSpan = Math.max(lonMax - lonMin, 0.01)
    const pad = 80
    for (const [id, loc] of resolved) {
      const x = pad + ((loc.lon - lonMin) / lonSpan) * (width - pad * 2)
      const y = pad + (1 - (loc.lat - latMin) / latSpan) * (height - pad * 2)
      positions.set(id, { x, y })
    }
  }
  // Unplaced nodes: a clearly-separated band along the bottom, not mixed
  // into the real map so the geography itself isn't misrepresented.
  unplaced.forEach((id, i) => {
    const cols = Math.ceil(Math.sqrt(unplaced.length))
    positions.set(id, { x: 40 + (i % cols) * 70, y: height + 60 + Math.floor(i / cols) * 60 })
  })
  return { positions, unplaced }
}
