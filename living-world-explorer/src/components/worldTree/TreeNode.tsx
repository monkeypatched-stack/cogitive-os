import { useWorldStore } from '../../store/worldStore'
import { TIER_LABELS, childrenOf, isEffectivelyExpanded, type MatchState } from './treeUtils'

interface TreeNodeProps {
  id: string
  depth: number
  match: MatchState
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) return <>{name}</>
  const lower = name.toLowerCase()
  const q = query.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx === -1) return <>{name}</>
  return (
    <>
      {name.slice(0, idx)}
      <mark className="lwe-tree-highlight">{name.slice(idx, idx + query.length)}</mark>
      {name.slice(idx + query.length)}
    </>
  )
}

export function TreeNode({ id, depth, match }: TreeNodeProps) {
  const entitiesById = useWorldStore((s) => s.entitiesById)
  const expandedIds = useWorldStore((s) => s.expandedIds)
  const selectedEntityId = useWorldStore((s) => s.selectedEntityId)
  const focusedEntityId = useWorldStore((s) => s.focusedEntityId)
  const searchQuery = useWorldStore((s) => s.searchQuery)
  const toggleExpand = useWorldStore((s) => s.toggleExpand)
  const selectEntity = useWorldStore((s) => s.selectEntity)
  const setFocusedEntityId = useWorldStore((s) => s.setFocusedEntityId)

  const entity = entitiesById[id]
  if (!entity) return null

  const childIds = childrenOf(entitiesById, id)
  const hasChildren = childIds.length > 0
  const expanded = isEffectivelyExpanded(id, expandedIds, match)
  const selected = selectedEntityId === id
  const focused = focusedEntityId === id

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={selected}
        aria-level={depth + 1}
        id={`lwe-tree-node-${id}`}
        tabIndex={focused ? 0 : -1}
        className={`lwe-tree-row${selected ? ' lwe-tree-row-selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 6 }}
        onClick={() => {
          selectEntity(id)
        }}
        onFocus={() => setFocusedEntityId(id)}
      >
        <button
          type="button"
          className={`lwe-tree-chevron${hasChildren ? '' : ' lwe-tree-chevron-empty'}`}
          tabIndex={-1}
          aria-hidden={!hasChildren}
          disabled={!hasChildren}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) toggleExpand(id)
          }}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : ''}
        </button>
        <span className="lwe-tree-tier">{TIER_LABELS[entity.entity_type]}</span>
        <span className="lwe-tree-name">
          <HighlightedName name={entity.name} query={searchQuery} />
        </span>
      </div>
      {hasChildren && expanded && (
        <ul role="group" className="lwe-tree-group">
          {childIds
            .filter((childId) => !match.active || match.matchIds.has(childId) || match.ancestorIds.has(childId))
            .map((childId) => (
              <TreeNode key={childId} id={childId} depth={depth + 1} match={match} />
            ))}
        </ul>
      )}
    </li>
  )
}
