// Shared ontology/world-state graph model — the real data assembly used by
// both the World State Graph (KnowledgeGraphPanel) and the Ontology
// Explorer (OntologyExplorerPanel). One source of truth for "what exists
// in the world and how it's connected" so the two views can never drift
// into showing different graphs of the same world.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY,
  type SimulationNodeDatum,
} from 'd3-force'
import {
  fetchAllActors, fetchActorAffiliations, type Actor, type Society, fetchSocieties, societyDisplayName,
} from '../api/actorClient'
import { fetchGeoEntities, fetchWorldLocations, type GeoEntity, type GeoEntityType, type WorldLocation } from '../api/geoClient'
import { fetchProducts, fetchMerchants, type Product, type Merchant } from '../api/commerceClient'
import type { GovernancePolicy } from '../api/societyClient'

export type OntologyType = 'human' | 'enterprise' | 'society' | 'geo' | 'product' | 'goal' | 'capability' | 'policy'

export interface WNode extends SimulationNodeDatum {
  id: string
  ontology: OntologyType
  subtype: string
  name: string
  status: string
  parentId?: string
  expandable?: boolean
  worldLocation?: { lat: number; lon: number } | null
  raw: Actor | Society | GeoEntity | Product | { policy: GovernancePolicy } | { goal: string } | { capability: string } | Merchant
}

export interface WEdge {
  id: string
  source: string
  target: string
  predicate: string
  trust?: number
}

export const ONTOLOGY_META: Record<OntologyType, { label: string; fg: string; bg: string; border: string; w: number; h: number }> = {
  human:      { label: 'Human',      fg: '#0F766E', bg: '#F0FDFA', border: '#99F6E4', w: 132, h: 52 },
  enterprise: { label: 'Enterprise', fg: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', w: 152, h: 58 },
  society:    { label: 'Society',    fg: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE', w: 150, h: 54 },
  geo:        { label: 'Location',   fg: '#B45309', bg: '#FFFBEB', border: '#FDE68A', w: 138, h: 50 },
  product:    { label: 'Resource',   fg: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD', w: 122, h: 46 },
  goal:       { label: 'Goal',       fg: '#BE123C', bg: '#FFF1F2', border: '#FECDD3', w: 130, h: 44 },
  capability: { label: 'Capability', fg: '#4D7C0F', bg: '#F7FEE7', border: '#D9F99D', w: 130, h: 44 },
  policy:     { label: 'Policy',     fg: '#475569', bg: '#F8FAFC', border: '#E2E8F0', w: 140, h: 44 },
}

export const ONTOLOGY_PLURAL: Record<OntologyType, string> = {
  human: 'Humans', enterprise: 'Enterprises', society: 'Societies', geo: 'Locations',
  product: 'Resources', goal: 'Goals', capability: 'Capabilities', policy: 'Policies',
}

export const PREDICATE_COLOR: Record<string, string> = {
  MEMBER_OF: '#94A3B8', FAMILY_OF: '#22C55E', FRIEND_OF: '#22C55E', ROOMMATE_OF: '#22C55E',
  SON_OF: '#22C55E', DAUGHTER_OF: '#22C55E', SIBLING_OF: '#22C55E', SPOUSE_OF: '#22C55E',
  CUSTOMER_OF: '#2563EB', SUPPLIED_BY: '#2563EB', EMPLOYED_BY: '#F59E0B', EMPLOYS: '#F59E0B',
  MANAGES: '#F59E0B', PART_OF: '#94A3B8', HOSTS: '#B45309', HAS_INVENTORY: '#0EA5E9',
  PURSUES: '#EF4444', HAS_CAPABILITY: '#65A30D', GOVERNED_BY: '#64748B',
}

// Real affiliation_type -> a real, correctly-directed predicate label —
// matches our actual stored edge direction (see Phase 5 seed script): e.g.
// "supplier" was seeded as buyer -> target=supplier, so the correct
// reading is "buyer SUPPLIED_BY supplier", not "SUPPLIES".
export function predicateFor(affiliationType: string): string {
  const t = affiliationType.toLowerCase()
  if (t === 'son_of') return 'SON_OF'
  if (t === 'daughter_of') return 'DAUGHTER_OF'
  if (t === 'sibling_of') return 'SIBLING_OF'
  if (t === 'marriage') return 'SPOUSE_OF'
  if (t.includes('family')) return 'FAMILY_OF'
  if (t.includes('friend')) return 'FRIEND_OF'
  if (t.includes('roommate')) return 'ROOMMATE_OF'
  if (t.includes('customer')) return 'CUSTOMER_OF'
  if (t.includes('supplier')) return 'SUPPLIED_BY'
  if (t === 'employed_by') return 'EMPLOYED_BY'
  if (t === 'employment') return 'EMPLOYS'
  if (t.includes('manage')) return 'MANAGES'
  if (t.includes('member')) return 'MEMBER_OF'
  return affiliationType.toUpperCase().slice(0, 18)
}

// Tiers visible without expanding a parent — everything from the city
// upward is always-on context; street/building/space only appear once
// their parent (or the enterprise/household hosted under them) is expanded.
export const GEO_DEFAULT_TIERS = new Set<GeoEntityType>(['planet', 'country', 'state', 'county', 'city'])

export function nodeIconPath(ontology: OntologyType, subtype: string) {
  switch (ontology) {
    case 'human':
      return <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" /></>
    case 'enterprise':
      return <path d="M4 20.5V9.5l8-5 8 5v11M4 20.5h16M9.5 20.5v-6h5v6" />
    case 'society':
      return <><circle cx="7.5" cy="8.5" r="2.6" /><circle cx="16.5" cy="8.5" r="2.6" /><path d="M2.5 19c0-3 2.5-5 5-5s5 2 5 5M11.5 19c0-3 2.5-5 5-5s5 2 5 5" /></>
    case 'geo':
      if (subtype === 'space' || subtype === 'building') return <path d="M4 21V8l8-5 8 5v13M4 21h16M9 21v-5h6v5" />
      return <><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="9" r="2.4" /></>
    case 'product':
      return <path d="M3.5 8.5 12 4l8.5 4.5L12 13 3.5 8.5ZM3.5 8.5V16L12 20.5M20.5 8.5V16L12 20.5V13" />
    case 'goal':
      return <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /></>
    case 'capability':
      return <path d="M12 3.5 14 8l5 .7-3.6 3.5.9 5-4.3-2.3-4.3 2.3.9-5L4 8.7 9 8Z" />
    case 'policy':
      return <path d="M6 3.5h9l3.5 3.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1ZM8.5 12h7M8.5 15.5h7M8.5 8.5h4" />
  }
}

export interface WorldData {
  actors: Actor[]
  societies: Society[]
  geo: GeoEntity[]
  products: Product[]
  merchants: Merchant[]
  worldLocations: Map<string, WorldLocation>
  affiliationsByActor: Map<string, { target_id: string; target_name: string; affiliation_type: string; trust_level: number }[]>
}

export async function loadWorld(): Promise<WorldData> {
  const [actors, societies, geo, products, merchants, locations] = await Promise.all([
    fetchAllActors(), fetchSocieties(), fetchGeoEntities(), fetchProducts(), fetchMerchants(), fetchWorldLocations(),
  ])
  const affPairs = await Promise.all(actors.map(async (a) => {
    const affs = await fetchActorAffiliations(a.actor_id).catch(() => [])
    return [a.actor_id, affs] as const
  }))
  return {
    actors, societies, geo, products, merchants,
    worldLocations: new Map(locations.map((l) => [l.location_id, l])),
    affiliationsByActor: new Map(affPairs),
  }
}

export function buildBaseGraph(world: WorldData): { nodes: WNode[]; edges: WEdge[] } {
  const nodes: WNode[] = []
  const edges: WEdge[] = []
  const nodeIds = new Set<string>()
  const addNode = (n: WNode) => { if (!nodeIds.has(n.id)) { nodeIds.add(n.id); nodes.push(n) } }
  const addEdge = (source: string, target: string, predicate: string, trust?: number) => {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return
    edges.push({ id: `${source}::${predicate}::${target}`, source, target, predicate, trust })
  }

  const merchantByOwner = new Map(world.merchants.map((m) => [m.owner_id, m]))

  for (const a of world.actors) {
    const isEnterprise = a.actor_type === 'enterprise'
    addNode({
      id: a.actor_id, ontology: isEnterprise ? 'enterprise' : 'human', subtype: a.actor_type,
      name: a.name, status: isEnterprise ? (merchantByOwner.get(a.actor_id)?.is_open ? 'open' : 'closed') : a.status,
      expandable: true, raw: a,
    })
  }

  for (const s of world.societies) {
    addNode({ id: s.society_id, ontology: 'society', subtype: s.society_type || 'generic',
      name: societyDisplayName(s.name), status: s.is_active === false ? 'inactive' : 'active', expandable: true, raw: s })
  }

  for (const g of world.geo) {
    if (!GEO_DEFAULT_TIERS.has(g.entity_type)) continue
    const loc = g.world_location_id ? world.worldLocations.get(g.world_location_id) : undefined
    addNode({ id: g.entity_id, ontology: 'geo', subtype: g.entity_type, name: g.name, status: 'existing',
      parentId: g.parent_id || undefined, expandable: (g.child_ids?.length ?? 0) > 0,
      worldLocation: loc ? { lat: loc.latitude, lon: loc.longitude } : null, raw: g })
  }
  for (const g of world.geo) {
    if (!GEO_DEFAULT_TIERS.has(g.entity_type) || !g.parent_id) continue
    addEdge(g.entity_id, g.parent_id, 'PART_OF')
  }

  // Real pairwise/structural edges — every one backed by an Affiliation
  // record (which already includes the auto-bridged Society membership
  // edges — see relationship_bridge.py), never a synthetic category node.
  for (const [actorId, affs] of world.affiliationsByActor) {
    for (const aff of affs) {
      if (!nodeIds.has(aff.target_id)) continue // external/unmodeled target (e.g. org:salesforce) — no real node to point at
      addEdge(actorId, aff.target_id, predicateFor(aff.affiliation_type), aff.trust_level)
    }
  }

  return { nodes, edges }
}

// Extra nodes/edges revealed only once their parent is expanded — computed
// on demand from the same already-fetched WorldData, not a new fetch.
export function buildExpansion(nodeId: string, world: WorldData, capCache: Map<string, string[]>, polCache: Map<string, GovernancePolicy[]>) {
  const nodes: WNode[] = []
  const edges: WEdge[] = []

  const geoEntity = world.geo.find((g) => g.entity_id === nodeId)
  if (geoEntity) {
    for (const childId of geoEntity.child_ids) {
      const child = world.geo.find((g) => g.entity_id === childId)
      if (!child) continue
      const childLoc = child.world_location_id ? world.worldLocations.get(child.world_location_id) : undefined
      nodes.push({ id: child.entity_id, ontology: 'geo', subtype: child.entity_type, name: child.name,
        status: 'existing', parentId: geoEntity.entity_id, expandable: child.child_ids.length > 0,
        worldLocation: childLoc ? { lat: childLoc.latitude, lon: childLoc.longitude } : null, raw: child })
      edges.push({ id: `${child.entity_id}::PART_OF::${geoEntity.entity_id}`, source: child.entity_id, target: geoEntity.entity_id, predicate: 'PART_OF' })
      for (const societyId of child.hosted_society_ids) {
        edges.push({ id: `${societyId}::HOSTS::${child.entity_id}`, source: societyId, target: child.entity_id, predicate: 'HOSTS' })
      }
    }
    return { nodes, edges }
  }

  const actor = world.actors.find((a) => a.actor_id === nodeId)
  if (actor) {
    for (const goal of actor.goals ?? []) {
      const id = `goal:${actor.actor_id}:${goal}`
      nodes.push({ id, ontology: 'goal', subtype: 'goal', name: goal, status: 'active', raw: { goal } })
      edges.push({ id: `${actor.actor_id}::PURSUES::${id}`, source: actor.actor_id, target: id, predicate: 'PURSUES' })
    }
    const caps = capCache.get(actor.actor_id)
    for (const cap of caps ?? []) {
      const id = `cap:${actor.actor_id}:${cap}`
      nodes.push({ id, ontology: 'capability', subtype: 'capability', name: cap, status: 'active', raw: { capability: cap } })
      edges.push({ id: `${actor.actor_id}::HAS_CAPABILITY::${id}`, source: actor.actor_id, target: id, predicate: 'HAS_CAPABILITY' })
    }
    if (actor.actor_type === 'enterprise') {
      const merchant = world.merchants.find((m) => m.owner_id === actor.actor_id)
      if (merchant) {
        for (const p of world.products.filter((p) => p.store_id === merchant.store_id)) {
          nodes.push({ id: `product:${p.id}`, ontology: 'product', subtype: 'product', name: p.name,
            status: p.quantity > 0 ? 'in-stock' : 'out-of-stock', raw: p })
          edges.push({ id: `${actor.actor_id}::HAS_INVENTORY::product:${p.id}`, source: actor.actor_id, target: `product:${p.id}`, predicate: 'HAS_INVENTORY' })
        }
      }
    }
    return { nodes, edges }
  }

  const society = world.societies.find((s) => s.society_id === nodeId)
  if (society) {
    const policies = polCache.get(society.society_id)
    for (const pol of policies ?? []) {
      const id = `policy:${pol.policy_id}`
      nodes.push({ id, ontology: 'policy', subtype: pol.policy_type, name: pol.name, status: pol.enabled ? 'enabled' : 'disabled', raw: { policy: pol } })
      edges.push({ id: `${society.society_id}::GOVERNED_BY::${id}`, source: society.society_id, target: id, predicate: 'GOVERNED_BY' })
    }
    return { nodes, edges }
  }

  return { nodes, edges }
}

// Every node reachable via any expand chain from the base graph, in one
// pass — the Ontology Explorer defaults to the FULL graph (a browser is
// expected to show everything, unlike the operational World State Graph's
// deliberately-collapsed default). capCache/polCache stay empty here
// (capabilities/policies are lazy-fetched per node on selection in both
// views) so this only walks structurally-known expansions (geo children,
// inventory, goals) -- capability/policy nodes appear once their owner is
// explicitly selected, same as the World State Graph.
export function buildFullGraph(world: WorldData): { nodes: WNode[]; edges: WEdge[] } {
  const base = buildBaseGraph(world)
  const nodes = [...base.nodes]
  const edges = [...base.edges]
  const seenN = new Set(nodes.map((n) => n.id))
  const seenE = new Set(edges.map((e) => e.id))
  const emptyCap = new Map<string, string[]>()
  const emptyPol = new Map<string, GovernancePolicy[]>()
    // Multiple passes: geo tiers cascade (city -> street -> building -> space).
  for (let pass = 0; pass < 3; pass++) {
    for (const n of [...nodes]) {
      if (!n.expandable) continue
      const ext = buildExpansion(n.id, world, emptyCap, emptyPol)
      for (const en of ext.nodes) if (!seenN.has(en.id)) { seenN.add(en.id); nodes.push(en) }
      for (const ee of ext.edges) if (!seenE.has(ee.id)) { seenE.add(ee.id); edges.push(ee) }
    }
  }
  return { nodes, edges }
}

// ─── Force-directed clustering layout ──────────────────────────────────────
// Shared by both views' default/"organic" layout mode. Nodes gently pull
// toward their ontology-type anchor while charge/collision/link forces
// keep the graph from collapsing — real force-directed placement, not
// hand-positioned coordinates.
export const CLUSTER_ANCHORS: Record<OntologyType, { x: number; y: number }> = {
  human: { x: 420, y: 260 }, enterprise: { x: 1180, y: 260 }, society: { x: 800, y: 620 },
  geo: { x: 1180, y: 900 }, product: { x: 1500, y: 500 }, goal: { x: 300, y: 620 },
  capability: { x: 300, y: 900 }, policy: { x: 1500, y: 900 },
}

export function useWorldSimulation(nodes: WNode[], edges: WEdge[], anchors: Record<OntologyType, { x: number; y: number }> = CLUSTER_ANCHORS, anchorStrength = 0.05) {
  const [, bump] = useState(0)
  const nodesRef = useRef<WNode[]>([])
  const simRef = useRef<ReturnType<typeof forceSimulation<WNode>> | null>(null)
  const signature = useMemo(() => `${nodes.map((n) => n.id).join(',')}|${edges.map((e) => e.id).join(',')}`, [nodes, edges])

  useEffect(() => {
    const prevPos = new Map(nodesRef.current.map((n) => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]))
    const simNodes: WNode[] = nodes.map((n) => {
      const prev = prevPos.get(n.id)
      const anchor = anchors[n.ontology]
      return { ...n, x: prev?.x ?? anchor.x + (Math.random() - 0.5) * 60, y: prev?.y ?? anchor.y + (Math.random() - 0.5) * 60, vx: prev?.vx ?? 0, vy: prev?.vy ?? 0 }
    })
    const idIndex = new Map(simNodes.map((n) => [n.id, n]))
    const simLinks = edges.filter((e) => idIndex.has(e.source) && idIndex.has(e.target)).map((e) => ({ ...e }))

    simRef.current?.stop()
    const sim = forceSimulation(simNodes)
      .force('link', forceLink(simLinks).id((d) => (d as WNode).id).distance(88).strength(0.22))
      .force('charge', forceManyBody().strength(-260))
      .force('collide', forceCollide<WNode>().radius((d) => Math.max(ONTOLOGY_META[d.ontology].w, ONTOLOGY_META[d.ontology].h) / 2 + 16))
      .force('x', forceX<WNode>((d) => anchors[d.ontology].x).strength(anchorStrength))
      .force('y', forceY<WNode>((d) => anchors[d.ontology].y).strength(anchorStrength))
      .alpha(0.7)
      .on('tick', () => bump((t) => t + 1))

    simRef.current = sim
    nodesRef.current = simNodes
    return () => { sim.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return nodesRef
}
