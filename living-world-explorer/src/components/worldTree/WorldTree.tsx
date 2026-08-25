import { useEffect, useMemo, useRef } from 'react'
import { useWorldStore } from '../../store/worldStore'
import { useRefreshStore } from '../../store/refreshStore'
import { TreeNode } from './TreeNode'
import { AddressSearch } from './AddressSearch'
import { ActorTree } from './ActorTree'
import { computeMatchState, computeVisibleOrder } from './treeUtils'
import './WorldTree.css'

export function WorldTree({ geographyOnly = false }: { geographyOnly?: boolean } = {}) {
  const entitiesById = useWorldStore((s) => s.entitiesById)
  const rootIds = useWorldStore((s) => s.rootIds)
  const loading = useWorldStore((s) => s.loading)
  const error = useWorldStore((s) => s.error)
  const expandedIds = useWorldStore((s) => s.expandedIds)
  const searchQuery = useWorldStore((s) => s.searchQuery)
  const focusedEntityId = useWorldStore((s) => s.focusedEntityId)
  const fetchEntities = useWorldStore((s) => s.fetchEntities)
  const setSearchQuery = useWorldStore((s) => s.setSearchQuery)
  const selectEntity = useWorldStore((s) => s.selectEntity)
  const setFocusedEntityId = useWorldStore((s) => s.setFocusedEntityId)
  const viewMode = useWorldStore((s) => s.viewMode)
  const setViewMode = useWorldStore((s) => s.setViewMode)

  useEffect(() => {
    if (geographyOnly && viewMode !== 'geography') setViewMode('geography')
  }, [geographyOnly, setViewMode, viewMode])

  const treeRef = useRef<HTMLUListElement>(null)
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)

  // Also refetches on refreshSeq — a real Planetary Tick or chat-
  // triggered actor prompt changed real state; the Map reads from this
  // same store, so this one call refreshes both.
  useEffect(() => {
    fetchEntities()
  }, [fetchEntities, refreshSeq])

  const match = useMemo(() => computeMatchState(entitiesById, searchQuery), [entitiesById, searchQuery])

  const visibleOrder = useMemo(
    () => computeVisibleOrder(entitiesById, rootIds, expandedIds, match),
    [entitiesById, rootIds, expandedIds, match],
  )

  // Focused row keeps real DOM focus in sync with the store — arrow-key
  // navigation moves focusedEntityId, this effect follows it, so
  // browser focus (for a11y) and our own "focus" concept never diverge.
  useEffect(() => {
    if (!focusedEntityId) return
    const el = document.getElementById(`lwe-tree-node-${focusedEntityId}`)
    el?.focus({ preventScroll: false })
  }, [focusedEntityId])

  useEffect(() => {
    if (focusedEntityId || visibleOrder.length === 0) return
    setFocusedEntityId(visibleOrder[0])
  }, [focusedEntityId, visibleOrder, setFocusedEntityId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (!focusedEntityId) return
    const index = visibleOrder.indexOf(focusedEntityId)
    if (index === -1) return

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const next = visibleOrder[Math.min(index + 1, visibleOrder.length - 1)]
        setFocusedEntityId(next)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prev = visibleOrder[Math.max(index - 1, 0)]
        setFocusedEntityId(prev)
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        const entity = entitiesById[focusedEntityId]
        const hasChildren = entity && entity.child_ids.length > 0
        if (hasChildren && !expandedIds.has(focusedEntityId)) {
          useWorldStore.getState().toggleExpand(focusedEntityId)
        } else if (hasChildren) {
          const next = visibleOrder[Math.min(index + 1, visibleOrder.length - 1)]
          setFocusedEntityId(next)
        }
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        if (expandedIds.has(focusedEntityId)) {
          useWorldStore.getState().toggleExpand(focusedEntityId)
        } else {
          const parentId = entitiesById[focusedEntityId]?.parent_id
          if (parentId) setFocusedEntityId(parentId)
        }
        break
      }
      case 'Home': {
        e.preventDefault()
        setFocusedEntityId(visibleOrder[0])
        break
      }
      case 'End': {
        e.preventDefault()
        setFocusedEntityId(visibleOrder[visibleOrder.length - 1])
        break
      }
      case 'Enter':
      case ' ': {
        e.preventDefault()
        selectEntity(focusedEntityId)
        break
      }
    }
  }

  return (
    <div className="lwe-world-tree">
      <div className="lwe-world-tree-mode">
        {!geographyOnly && <button
          type="button"
          className={viewMode === 'geography' ? 'lwe-world-tree-mode-active' : ''}
          onClick={() => setViewMode('geography')}
        >
          Geography
        </button>}
        {!geographyOnly && <button
          type="button"
          className={viewMode === 'actor' ? 'lwe-world-tree-mode-active' : ''}
          onClick={() => setViewMode('actor')}
        >
          By Actor
        </button>}
      </div>

      {!geographyOnly && (
        <div className="lwe-world-tree-search">
          <input
            type="search"
            placeholder={
              viewMode === 'geography' ? 'Filter loaded entities...' : 'Filter actors...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search World Tree"
          />
        </div>
      )}

      {viewMode === 'geography' && <AddressSearch />}

      {viewMode === 'actor' && <ActorTree />}

      {viewMode === 'geography' && (
        <>
          {loading && <div className="lwe-world-tree-status">Loading world hierarchy...</div>}
          {error && <div className="lwe-world-tree-status lwe-world-tree-error">Failed to load: {error}</div>}
          {!loading && !error && rootIds.length === 0 && (
            <div className="lwe-world-tree-status">No geography yet.</div>
          )}
          {!loading && !error && match.active && match.matchIds.size === 0 && (
            <div className="lwe-world-tree-status">No matches for "{searchQuery}".</div>
          )}

          {!loading && !error && rootIds.length > 0 && (
            <ul role="tree" aria-label="World hierarchy" className="lwe-tree-group lwe-tree-root" ref={treeRef} onKeyDown={handleKeyDown}>
              {rootIds
                .filter((id) => !match.active || match.matchIds.has(id) || match.ancestorIds.has(id))
                .map((id) => (
                  <TreeNode key={id} id={id} depth={0} match={match} />
                ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
