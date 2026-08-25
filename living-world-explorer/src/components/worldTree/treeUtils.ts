import type { GeoEntity } from '../../api/geoClient'

export const TIER_LABELS: Record<GeoEntity['entity_type'], string> = {
  planet: 'Planet',
  country: 'Country',
  state: 'State',
  county: 'County',
  city: 'City',
  street: 'Street',
  building: 'Building',
  space: 'Space',
}

/** Top-down ancestor chain ending at `id` itself — [Planet, ..., id] —
 * the reverse of walking parent_id up. Used by the By Actor view to
 * render an actor's current location as Planet -> ... -> Space, not
 * the other way around. Stops (returns []) if any link in the chain
 * isn't in entitiesById — e.g. the actor's Space resolves through the
 * hidden Default chain, which should read as "not really located"
 * rather than a broken partial chain. */
export function buildAncestorChain(entitiesById: Record<string, GeoEntity>, id: string): GeoEntity[] {
  const chain: GeoEntity[] = []
  let current: string | null = id
  while (current) {
    const entity: GeoEntity | undefined = entitiesById[current]
    if (!entity) return []
    chain.unshift(entity)
    current = entity.parent_id
  }
  return chain
}

export function childrenOf(entitiesById: Record<string, GeoEntity>, id: string): string[] {
  const entity = entitiesById[id]
  if (!entity) return []
  // child_ids is the source of truth for structure, but only entities
  // actually present in entitiesById are renderable (defends against a
  // stale/partial fetch rather than crashing on a dangling id).
  return entity.child_ids.filter((childId) => entitiesById[childId])
}

export interface MatchState {
  active: boolean
  matchIds: Set<string>
  ancestorIds: Set<string>
}

/** Nodes whose name matches `query`, plus every ancestor needed to
 * reach them — the ancestor set is what search auto-expands, computed
 * fresh each time rather than mutating persistent expand state, so
 * clearing the search restores exactly what the user had manually
 * expanded before. */
export function computeMatchState(
  entitiesById: Record<string, GeoEntity>,
  query: string,
): MatchState {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return { active: false, matchIds: new Set(), ancestorIds: new Set() }

  const matchIds = new Set<string>()
  const ancestorIds = new Set<string>()
  for (const entity of Object.values(entitiesById)) {
    if (!entity.name.toLowerCase().includes(trimmed)) continue
    matchIds.add(entity.entity_id)
    let parentId = entity.parent_id
    while (parentId && !ancestorIds.has(parentId)) {
      ancestorIds.add(parentId)
      parentId = entitiesById[parentId]?.parent_id ?? null
    }
  }
  return { active: true, matchIds, ancestorIds }
}

export function isEffectivelyExpanded(
  id: string,
  expandedIds: Set<string>,
  match: MatchState,
): boolean {
  if (match.active) return match.ancestorIds.has(id)
  return expandedIds.has(id)
}

function isVisibleDuringSearch(id: string, match: MatchState): boolean {
  return match.matchIds.has(id) || match.ancestorIds.has(id)
}

/** Flat, top-to-bottom order of every node currently rendered on
 * screen (respecting collapse state and an active search filter) —
 * the sequence ArrowUp/ArrowDown keyboard focus moves through. Must
 * mirror TreeNode's own recursion exactly, or keyboard focus and
 * visual position would silently disagree. */
export function computeVisibleOrder(
  entitiesById: Record<string, GeoEntity>,
  rootIds: string[],
  expandedIds: Set<string>,
  match: MatchState,
): string[] {
  const order: string[] = []

  const visit = (id: string) => {
    if (match.active && !isVisibleDuringSearch(id, match)) return
    order.push(id)
    if (!isEffectivelyExpanded(id, expandedIds, match)) return
    for (const childId of childrenOf(entitiesById, id)) visit(childId)
  }

  for (const rootId of rootIds) visit(rootId)
  return order
}
