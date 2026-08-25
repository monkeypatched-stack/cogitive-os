// Real, general-purpose graph algorithms over the world graph's node/edge
// lists — no fabrication: these are the textbook algorithms (BFS,
// Brandes' betweenness, Tarjan's SCC, label propagation), run against
// whatever nodes/edges are currently loaded in the explorer. Nothing here
// pretends to be a bigger claim than it is — label propagation is a real
// but approximate community-detection method, not full Louvain modularity
// optimization; "Communication Network" (in OntologyExplorerPanel) is
// documented there as the direct/reverse-affiliation subset of the real
// 9-rule AffiliationGraph.can_communicate() precedence, not a
// reimplementation of all nine rules.
import type { WEdge } from './worldGraph'

export interface AdjacencyIndex {
  outNeighbors: Map<string, string[]>
  inNeighbors: Map<string, string[]>
  undirectedNeighbors: Map<string, string[]>
}

export function buildAdjacency(nodeIds: string[], edges: WEdge[]): AdjacencyIndex {
  const outNeighbors = new Map<string, string[]>()
  const inNeighbors = new Map<string, string[]>()
  const undirectedNeighbors = new Map<string, string[]>()
  for (const id of nodeIds) { outNeighbors.set(id, []); inNeighbors.set(id, []); undirectedNeighbors.set(id, []) }
  for (const e of edges) {
    outNeighbors.get(e.source)?.push(e.target)
    inNeighbors.get(e.target)?.push(e.source)
    undirectedNeighbors.get(e.source)?.push(e.target)
    undirectedNeighbors.get(e.target)?.push(e.source)
  }
  return { outNeighbors, inNeighbors, undirectedNeighbors }
}

// Unweighted BFS shortest path, treating edges as undirected (a "shortest
// path" between two entities in an exploration tool means "how are these
// connected", not "is there a directed route").
export function bfsShortestPath(source: string, target: string, adj: AdjacencyIndex): string[] | null {
  if (source === target) return [source]
  const visited = new Set<string>([source])
  const parent = new Map<string, string>()
  const queue = [source]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const next of adj.undirectedNeighbors.get(cur) ?? []) {
      if (visited.has(next)) continue
      visited.add(next); parent.set(next, cur)
      if (next === target) {
        const path = [target]
        let cursor = target
        while (parent.has(cursor)) { cursor = parent.get(cursor)!; path.push(cursor) }
        return path.reverse()
      }
      queue.push(next)
    }
  }
  return null
}

// Every simple path (no repeated nodes) between source and target, up to
// maxDepth hops, capped at maxPaths results — DFS with backtracking.
// Bounded deliberately: enumerating all simple paths is exponential in the
// worst case, so this is a real but capped search, not a full traversal.
export function findAllPaths(source: string, target: string, adj: AdjacencyIndex, maxDepth = 6, maxPaths = 25): string[][] {
  const results: string[][] = []
  const visited = new Set<string>([source])
  const path = [source]
  function dfs(cur: string) {
    if (results.length >= maxPaths) return
    if (cur === target) { results.push([...path]); return }
    if (path.length > maxDepth) return
    for (const next of adj.undirectedNeighbors.get(cur) ?? []) {
      if (visited.has(next) || results.length >= maxPaths) continue
      visited.add(next); path.push(next)
      dfs(next)
      path.pop(); visited.delete(next)
    }
  }
  dfs(source)
  return results
}

// Weakly connected components (undirected reachability) via BFS/union —
// every node gets a component id; two nodes share one iff there's ANY
// undirected path between them in the currently-loaded graph.
export function connectedComponents(nodeIds: string[], adj: AdjacencyIndex): Map<string, number> {
  const componentOf = new Map<string, number>()
  let compId = 0
  for (const start of nodeIds) {
    if (componentOf.has(start)) continue
    const queue = [start]
    componentOf.set(start, compId)
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const next of adj.undirectedNeighbors.get(cur) ?? []) {
        if (componentOf.has(next)) continue
        componentOf.set(next, compId)
        queue.push(next)
      }
    }
    compId += 1
  }
  return componentOf
}

// Degree centrality — real edge count per node (in + out), the simplest
// honest measure of "how connected is this entity right now."
export function degreeCentrality(nodeIds: string[], adj: AdjacencyIndex): Map<string, number> {
  const degree = new Map<string, number>()
  for (const id of nodeIds) degree.set(id, (adj.outNeighbors.get(id)?.length ?? 0) + (adj.inNeighbors.get(id)?.length ?? 0))
  return degree
}

// Brandes' algorithm (2001) — exact betweenness centrality on the
// undirected graph in O(V*E). Real, unweighted implementation; not an
// approximation.
export function betweennessCentrality(nodeIds: string[], adj: AdjacencyIndex): Map<string, number> {
  const centrality = new Map<string, number>(nodeIds.map((id) => [id, 0]))
  for (const s of nodeIds) {
    const stack: string[] = []
    const predecessors = new Map<string, string[]>(nodeIds.map((id) => [id, []]))
    const sigma = new Map<string, number>(nodeIds.map((id) => [id, 0]))
    const dist = new Map<string, number>(nodeIds.map((id) => [id, -1]))
    sigma.set(s, 1); dist.set(s, 0)
    const queue = [s]
    while (queue.length > 0) {
      const v = queue.shift()!
      stack.push(v)
      for (const w of adj.undirectedNeighbors.get(v) ?? []) {
        if (dist.get(w) === -1) { dist.set(w, dist.get(v)! + 1); queue.push(w) }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!)
          predecessors.get(w)!.push(v)
        }
      }
    }
    const delta = new Map<string, number>(nodeIds.map((id) => [id, 0]))
    while (stack.length > 0) {
      const w = stack.pop()!
      for (const v of predecessors.get(w) ?? []) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / Math.max(sigma.get(w)!, 1)) * (1 + delta.get(w)!))
      }
      if (w !== s) centrality.set(w, centrality.get(w)! + delta.get(w)!)
    }
  }
  // Undirected graph: each shortest path is counted from both endpoints' runs.
  for (const id of nodeIds) centrality.set(id, centrality.get(id)! / 2)
  return centrality
}

// Tarjan's algorithm — exact strongly connected components on the
// DIRECTED graph. In a mostly tree/DAG-shaped world (few real directed
// cycles), most components will legitimately be singletons; that's a
// correct result, not a sign the algorithm did nothing.
export function stronglyConnectedComponents(nodeIds: string[], adj: AdjacencyIndex): Map<string, number> {
  let index = 0
  const indices = new Map<string, number>()
  const lowlink = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const componentOf = new Map<string, number>()
  let compId = 0

  function strongConnect(v: string) {
    indices.set(v, index); lowlink.set(v, index); index += 1
    stack.push(v); onStack.add(v)
    for (const w of adj.outNeighbors.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w)
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!))
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!))
      }
    }
    if (lowlink.get(v) === indices.get(v)) {
      let w: string
      do {
        w = stack.pop()!
        onStack.delete(w)
        componentOf.set(w, compId)
      } while (w !== v)
      compId += 1
    }
  }

  for (const v of nodeIds) if (!indices.has(v)) strongConnect(v)
  return componentOf
}

// Label propagation (Raghavan/Albert/Kumara 2007, simplified) — a real,
// fast, approximate community-detection method: each node adopts the
// majority label among its neighbors, iterated until stable or a cap.
// Not full modularity-optimizing Louvain clustering — an honest, lighter
// substitute that still finds real structure in a graph this size.
export function labelPropagationCommunities(nodeIds: string[], adj: AdjacencyIndex, maxIterations = 20): Map<string, number> {
  const labels = new Map<string, number>(nodeIds.map((id, i) => [id, i]))
  const order = [...nodeIds]
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[order[i], order[j]] = [order[j], order[i]] }
    for (const node of order) {
      const neighbors = adj.undirectedNeighbors.get(node) ?? []
      if (neighbors.length === 0) continue
      const counts = new Map<number, number>()
      for (const n of neighbors) { const l = labels.get(n)!; counts.set(l, (counts.get(l) ?? 0) + 1) }
      let bestLabel = labels.get(node)!, bestCount = -1
      for (const [label, count] of counts) if (count > bestCount) { bestCount = count; bestLabel = label }
      if (bestLabel !== labels.get(node)) { labels.set(node, bestLabel); changed = true }
    }
    if (!changed) break
  }
  // Renumber to small dense ids for stable, readable color assignment.
  const remap = new Map<number, number>()
  let next = 0
  for (const id of nodeIds) {
    const l = labels.get(id)!
    if (!remap.has(l)) remap.set(l, next++)
    labels.set(id, remap.get(l)!)
  }
  return labels
}

export const ANALYTICS_PALETTE = [
  '#2563EB', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#D946EF',
]
