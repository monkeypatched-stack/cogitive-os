import { useEffect, useMemo } from 'react'
import { useWorldStore } from '../../store/worldStore'
import { TIER_LABELS, buildAncestorChain } from './treeUtils'
import type { Actor } from '../../api/actorClient'
import type { GeoEntity } from '../../api/geoClient'

function ActorChain({ chain }: { chain: GeoEntity[] }) {
  const selectedEntityId = useWorldStore((s) => s.selectedEntityId)
  const selectEntity = useWorldStore((s) => s.selectEntity)

  return (
    <ul className="lwe-tree-group">
      {chain.map((entity, depth) => (
        <li key={entity.entity_id} role="none">
          <div
            role="treeitem"
            aria-selected={selectedEntityId === entity.entity_id}
            className={`lwe-tree-row${selectedEntityId === entity.entity_id ? ' lwe-tree-row-selected' : ''}`}
            style={{ paddingLeft: (depth + 1) * 16 + 6 }}
            onClick={() => selectEntity(entity.entity_id)}
          >
            <span className="lwe-tree-chevron lwe-tree-chevron-empty" />
            <span className="lwe-tree-tier">{TIER_LABELS[entity.entity_type]}</span>
            <span className="lwe-tree-name">{entity.name}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ActorRow({ actor }: { actor: Actor }) {
  const rawEntitiesById = useWorldStore((s) => s.rawEntitiesById)
  const occupancyByActorId = useWorldStore((s) => s.occupancyByActorId)
  const societyToEntityId = useWorldStore((s) => s.societyToEntityId)
  const expandedActorIds = useWorldStore((s) => s.expandedActorIds)
  const toggleActorExpand = useWorldStore((s) => s.toggleActorExpand)
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const highlightedActorIds = useWorldStore((s) => s.highlightedActorIds)
  const selectActor = useWorldStore((s) => s.selectActor)

  const expanded = expandedActorIds.has(actor.actor_id)

  // Real, precise: an actual PresenceTimeline entry for this actor.
  const presenceSpaceId = occupancyByActorId[actor.actor_id]
  // Real, but generic: no actor has ever been moved anywhere yet (no
  // movement UI exists), so presence is empty for everyone — but every
  // actor's Society IS hosted somewhere real (today, that's Default
  // City for all of them, since nothing more specific has been
  // configured). That's still a genuine answer, not nothing — shown,
  // but honestly labeled as inherited-via-society rather than implying
  // this actor is personally, physically there.
  const societyEntityId = !presenceSpaceId ? societyToEntityId[actor.societies[0]] : undefined

  const chain = presenceSpaceId
    ? buildAncestorChain(rawEntitiesById, presenceSpaceId)
    : societyEntityId
      ? buildAncestorChain(rawEntitiesById, societyEntityId)
      : []

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-expanded={expanded}
            className={`lwe-tree-row${selectedActorId === actor.actor_id ? ' lwe-tree-row-selected' : ''}${highlightedActorIds.has(actor.actor_id) ? ' lwe-tree-row-highlighted' : ''}`}
        style={{ paddingLeft: 6 }}
        onClick={() => {
          selectActor(actor.actor_id)
          toggleActorExpand(actor.actor_id)
        }}
      >
        <button
          type="button"
          className="lwe-tree-chevron"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            toggleActorExpand(actor.actor_id)
          }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="lwe-tree-tier">{actor.actor_type || 'actor'}</span>
        <span className="lwe-tree-name">{actor.name}</span>
      </div>
      {expanded && (
        chain.length > 0 ? (
          <>
            {!presenceSpaceId && (
              <div className="lwe-actor-tree-note" style={{ paddingLeft: 22 }}>
                Not directly located — shown via this actor's Society
              </div>
            )}
            <ActorChain chain={chain} />
          </>
        ) : (
          <div className="lwe-actor-tree-unlocated" style={{ paddingLeft: 22 }}>Not currently located</div>
        )
      )}
    </li>
  )
}

/**
 * "By Actor" view: Actor -> Planet -> ... -> Space, one real chain per
 * actor, instead of Prompt 2's geography-first Planet -> ... -> Actor
 * (implicit, via Inspector occupants). Same underlying data — real
 * GET /planet/actors + GET /presence — reused, not duplicated: an
 * actor's chain is the exact same GeoEntity objects the Geography view
 * renders, just walked top-down from a different starting point.
 * Clicking a geography node in the chain reuses selectEntity() as-is,
 * so the Inspector/Map keep working unchanged.
 */
export function ActorTree() {
  const actorsById = useWorldStore((s) => s.actorsById)
  const searchQuery = useWorldStore((s) => s.searchQuery)
  const loading = useWorldStore((s) => s.loading)
  const error = useWorldStore((s) => s.error)
  const fetchEntities = useWorldStore((s) => s.fetchEntities)

  useEffect(() => {
    fetchEntities()
  }, [fetchEntities])

  const actors = useMemo(() => {
    // digital_service actors (Stripe, PayPal, ShopHub...) are backend
    // integrations/services, not something a user browsing "who is
    // where in the world" is looking for.
    const all = Object.values(actorsById)
      .filter((a) => a.actor_type !== 'digital_service')
      .sort((a, b) => a.name.localeCompare(b.name))
    const query = searchQuery.trim().toLowerCase()
    if (!query) return all
    return all.filter((a) => a.name.toLowerCase().includes(query))
  }, [actorsById, searchQuery])

  if (loading) return <div className="lwe-world-tree-status">Loading actors...</div>
  if (error) return <div className="lwe-world-tree-status lwe-world-tree-error">Failed to load: {error}</div>
  if (actors.length === 0) return <div className="lwe-world-tree-status">No actors match.</div>

  return (
    <ul role="tree" aria-label="Actors" className="lwe-tree-group lwe-tree-root">
      {actors.map((actor) => (
        <ActorRow key={actor.actor_id} actor={actor} />
      ))}
    </ul>
  )
}
