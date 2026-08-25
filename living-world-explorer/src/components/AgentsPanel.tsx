import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createActor, deleteActor, fetchActors, updateActor, type Actor } from '../api/actorClient'
import { useRefreshStore } from '../store/refreshStore'
import { useWorldStore } from '../store/worldStore'

/** Full CRUD (create/edit/delete via POST, PATCH, DELETE /actors) for
 * both Humans and Enterprises — one component parameterized by
 * `actorType` (what new rows get created as) and `title`. A dedicated
 * <table> instead of the shared ActorTable primitive: ActorTable
 * stringifies every cell (inspectorPrimitives.tsx's readable()), so it
 * can't host the Edit/Delete buttons or an inline edit row without
 * changing behavior for every other ActorTable consumer in the app. */
function EditableActorTable({ title, actorType, agents, onSelect, onSecurity }: { title: string; actorType: string; agents: Actor[]; onSelect: (id: string) => void; onSecurity: (id: string) => void }) {
  const bumpRefresh = useRefreshStore((s) => s.bumpRefresh)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'status' | 'description'>('name')
  const [ascending, setAscending] = useState(true)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const visible = useMemo(() => agents.filter((agent) => `${agent.name} ${agent.status} ${agent.description}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
    const left = String(a[sortKey] ?? '').toLowerCase()
    const right = String(b[sortKey] ?? '').toLowerCase()
    return (left.localeCompare(right) || a.name.localeCompare(b.name)) * (ascending ? 1 : -1)
  }), [agents, query, sortKey, ascending])

  const sort = (key: 'name' | 'status' | 'description') => {
    if (sortKey === key) setAscending((value) => !value)
    else { setSortKey(key); setAscending(true) }
  }

  const submitCreate = async () => {
    if (!newName.trim()) return
    setFormError('')
    setBusyId('__create__')
    try {
      await createActor({ name: newName.trim(), actor_type: actorType, description: newDescription.trim() })
      setNewName('')
      setNewDescription('')
      setCreating(false)
      bumpRefresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const startEdit = (agent: Actor) => {
    setEditingId(agent.actor_id)
    setEditName(agent.name)
    setEditDescription(agent.description)
    setFormError('')
  }

  const submitEdit = async () => {
    if (!editingId || !editName.trim()) return
    setFormError('')
    setBusyId(editingId)
    try {
      await updateActor(editingId, { name: editName.trim(), description: editDescription.trim() })
      setEditingId(null)
      bumpRefresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (agent: Actor) => {
    if (!window.confirm(`Delete ${agent.name}? This cannot be undone.`)) return
    setFormError('')
    setBusyId(agent.actor_id)
    try {
      await deleteActor(agent.actor_id)
      bumpRefresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
      setBusyId(null)
    }
  }

  return <section className="lwe-agents-group">
    <div className="lwe-agents-group-heading">
      <h2>{title} <span>{visible.length}</span></h2>
      <div className="lwe-agents-heading-actions">
        <input aria-label={`Search ${title}`} placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="lwe-agents-add-button" onClick={() => { setCreating((v) => !v); setFormError('') }}>{creating ? 'Cancel' : `+ Add ${actorType}`}</button>
      </div>
    </div>
    <div className="lwe-agents-sort">
      <span>Sort:</span>
      {(['name', 'status', 'description'] as const).map((key) => <button type="button" key={key} onClick={() => sort(key)}>{key === 'name' ? 'Name' : key === 'status' ? 'Status' : 'Description'} {sortKey === key ? (ascending ? '↑' : '↓') : ''}</button>)}
    </div>

    {creating && <div className="lwe-agents-inline-form">
      <input aria-label={`New ${actorType} name`} placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
      <input aria-label={`New ${actorType} description`} placeholder="Description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
      <button type="button" onClick={submitCreate} disabled={busyId === '__create__' || !newName.trim()}>{busyId === '__create__' ? 'Creating…' : 'Create'}</button>
    </div>}

    {formError && <div className="lwe-inspector-error">{formError}</div>}

    {visible.length === 0 && <div className="lwe-inspector-muted">No matching actors.</div>}
    {visible.length > 0 && <div className="lwe-inspector-table-wrap"><table className="lwe-inspector-table">
      <thead><tr><th>Agent</th><th>Type</th><th>Status</th><th>Description</th><th className="lwe-agents-actions-header">Actions</th></tr></thead>
      <tbody>
        {visible.map((agent) => {
          const isEditing = editingId === agent.actor_id
          const isBusy = busyId === agent.actor_id
          return isEditing ? (
            <tr key={agent.actor_id}>
              <td><input aria-label="Edit name" value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
              <td>{agent.actor_type || 'actor'}</td>
              <td>{agent.status}</td>
              <td><input aria-label="Edit description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></td>
              <td className="lwe-agents-row-actions">
                <button type="button" onClick={submitEdit} disabled={isBusy || !editName.trim()}>{isBusy ? 'Saving…' : 'Save'}</button>
                <button type="button" onClick={() => setEditingId(null)} disabled={isBusy}>Cancel</button>
              </td>
            </tr>
          ) : (
            <tr key={agent.actor_id} className="lwe-inspector-row-clickable" onClick={() => onSelect(agent.actor_id)}>
              <td>{agent.name}</td>
              <td>{agent.actor_type || 'actor'}</td>
              <td>{agent.status}</td>
              <td>{agent.description || 'Not available'}</td>
              <td className="lwe-agents-row-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="lwe-icon-button" title="Security" aria-label={`Security for ${agent.name}`} onClick={() => onSecurity(agent.actor_id)} disabled={isBusy}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z" /></svg>
                </button>
                <button type="button" className="lwe-icon-button" title="Edit" aria-label={`Edit ${agent.name}`} onClick={() => startEdit(agent)} disabled={isBusy}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button type="button" className="lwe-icon-button" title="Delete" aria-label={`Delete ${agent.name}`} onClick={() => remove(agent)} disabled={isBusy}>
                  {isBusy
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>}
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table></div>}
  </section>
}

export function AgentsPanel() {
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)
  const selectActor = useWorldStore((s) => s.selectActor)
  const navigate = useNavigate()
  const openSecurity = (id: string) => { selectActor(id); navigate('/security') }
  const [agents, setAgents] = useState<Actor[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    fetchActors().then((result) => {
      if (cancelled) return
      const seen = new Set<string>()
      const unique = result.filter((agent) => {
        const key = agent.actor_id || `${agent.name}|${agent.actor_type}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setAgents(unique)
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err))
    })
    return () => { cancelled = true }
  }, [refreshSeq])
  return <div className="lwe-inspector lwe-agents-content">
    <div className="lwe-inspector-tier">Registered cognitive actors</div>
    {error && <div className="lwe-inspector-error">{error}</div>}
    {!error && <>
      <EditableActorTable title="Humans" actorType="human" agents={agents.filter((agent) => (agent.actor_type || '').toLowerCase() === 'human')} onSelect={selectActor} onSecurity={openSecurity} />
      <EditableActorTable title="Enterprises" actorType="enterprise" agents={agents.filter((agent) => (agent.actor_type || '').toLowerCase() !== 'human')} onSelect={selectActor} onSecurity={openSecurity} />
    </>}
  </div>
}
