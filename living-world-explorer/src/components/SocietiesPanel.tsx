import { useEffect, useMemo, useState } from 'react'
import { createSociety, deleteSociety, fetchActors, fetchSocieties, societyDisplayName, updateSociety, type Actor, type Society } from '../api/actorClient'
import {
  addMembershipRole, createMembership, deleteMembership, fetchSocietyMemberships, removeMembershipRole,
  type Membership,
} from '../api/societyClient'
import { useCycleStore } from '../store/cycleStore'
import { useRefreshStore } from '../store/refreshStore'
import { useWorldStore } from '../store/worldStore'
import { SocietyGraphPanel } from './SocietyGraphPanel'

/** Full CRUD (create/edit/delete via POST, PATCH, DELETE /societies) —
 * same pattern as AgentsPanel's EditableActorTable. A dedicated <table>
 * instead of the shared ActorTable primitive for the same reason: that
 * primitive stringifies every cell, so it can't host the Edit/Delete
 * icon buttons or an inline edit row. Only name/description are
 * PATCH-able (SocietyUpdateRequest has no society_type field), so Type/
 * Actors/Status stay plain text even while a row is being edited. */
function EditableSocietyTable({ societies, coordinatingSocietyIds, onSelect }: { societies: Society[]; coordinatingSocietyIds: Set<string>; onSelect: (id: string) => void }) {
  const bumpRefresh = useRefreshStore((s) => s.bumpRefresh)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'type' | 'status'>('name')
  const [ascending, setAscending] = useState(true)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newType, setNewType] = useState('generic')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const visible = useMemo(() => {
    const sortValue = (society: Society) =>
      sortKey === 'type' ? society.society_type || 'generic' : sortKey === 'status' ? (society.is_active === false ? 'inactive' : 'active') : societyDisplayName(society.name)
    return societies
      .filter((society) => `${societyDisplayName(society.name)} ${society.society_type ?? ''}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => (sortValue(a).toLowerCase().localeCompare(sortValue(b).toLowerCase()) || societyDisplayName(a.name).localeCompare(societyDisplayName(b.name))) * (ascending ? 1 : -1))
  }, [societies, query, sortKey, ascending])

  const sort = (key: 'name' | 'type' | 'status') => {
    if (sortKey === key) setAscending((value) => !value)
    else { setSortKey(key); setAscending(true) }
  }

  const submitCreate = async () => {
    if (!newName.trim()) return
    setFormError('')
    setBusyId('__create__')
    try {
      await createSociety({ name: newName.trim(), description: newDescription.trim(), society_type: newType.trim() || 'generic' })
      setNewName('')
      setNewDescription('')
      setNewType('generic')
      setCreating(false)
      bumpRefresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const startEdit = (society: Society) => {
    setEditingId(society.society_id)
    setEditName(societyDisplayName(society.name))
    setEditDescription(society.description ?? '')
    setFormError('')
  }

  const submitEdit = async () => {
    if (!editingId || !editName.trim()) return
    setFormError('')
    setBusyId(editingId)
    try {
      await updateSociety(editingId, { name: editName.trim(), description: editDescription.trim() })
      setEditingId(null)
      bumpRefresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (society: Society) => {
    if (!window.confirm(`Delete ${societyDisplayName(society.name)}? This removes every actor's membership in it too and cannot be undone.`)) return
    setFormError('')
    setBusyId(society.society_id)
    try {
      await deleteSociety(society.society_id)
      bumpRefresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
      setBusyId(null)
    }
  }

  return <section className="lwe-agents-group">
    <div className="lwe-agents-group-heading">
      <h2>Societies <span>{visible.length}</span></h2>
      <div className="lwe-agents-heading-actions">
        <input aria-label="Search societies" placeholder="Search societies…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="lwe-agents-add-button" onClick={() => { setCreating((v) => !v); setFormError('') }}>{creating ? 'Cancel' : '+ Add society'}</button>
      </div>
    </div>
    <div className="lwe-agents-sort">
      <span>Sort:</span>
      {(['name', 'type', 'status'] as const).map((key) => <button type="button" key={key} onClick={() => sort(key)}>{key === 'name' ? 'Name' : key === 'type' ? 'Type' : 'Status'} {sortKey === key ? (ascending ? '↑' : '↓') : ''}</button>)}
    </div>

    {creating && <div className="lwe-agents-inline-form">
      <input aria-label="New society name" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
      <input aria-label="New society type" placeholder="Type (e.g. generic)" value={newType} onChange={(e) => setNewType(e.target.value)} />
      <input aria-label="New society description" placeholder="Description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
      <button type="button" onClick={submitCreate} disabled={busyId === '__create__' || !newName.trim()}>{busyId === '__create__' ? 'Creating…' : 'Create'}</button>
    </div>}

    {formError && <div className="lwe-inspector-error">{formError}</div>}

    {visible.length === 0 && <div className="lwe-inspector-muted">No matching societies.</div>}
    {visible.length > 0 && <div className="lwe-inspector-table-wrap"><table className="lwe-inspector-table">
      <thead><tr><th>Society</th><th>Type</th><th>Actors</th><th>Status</th><th>Description</th><th className="lwe-agents-actions-header">Actions</th></tr></thead>
      <tbody>
        {visible.map((society) => {
          const isEditing = editingId === society.society_id
          const isBusy = busyId === society.society_id
          const displayName = societyDisplayName(society.name)
          const statusLabel = coordinatingSocietyIds.has(society.society_id) ? 'Coordinating' : society.is_active === false ? 'Inactive' : 'Active'
          return isEditing ? (
            <tr key={society.society_id}>
              <td><input aria-label="Edit name" value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
              <td>{society.society_type || 'generic'}</td>
              <td>{`${society.active_actors ?? 0}/${society.actor_count ?? 0}`}</td>
              <td>{statusLabel}</td>
              <td><input aria-label="Edit description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></td>
              <td className="lwe-agents-row-actions">
                <button type="button" onClick={submitEdit} disabled={isBusy || !editName.trim()}>{isBusy ? 'Saving…' : 'Save'}</button>
                <button type="button" onClick={() => setEditingId(null)} disabled={isBusy}>Cancel</button>
              </td>
            </tr>
          ) : (
            <tr key={society.society_id} className="lwe-inspector-row-clickable" onClick={() => onSelect(society.society_id)}>
              <td>{displayName}</td>
              <td>{society.society_type || 'generic'}</td>
              <td>{`${society.active_actors ?? 0}/${society.actor_count ?? 0}`}</td>
              <td>{statusLabel}</td>
              <td className="lwe-cell-truncate" title={society.description || 'Not available'}>{society.description || 'Not available'}</td>
              <td className="lwe-agents-row-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="lwe-icon-button" title="Edit" aria-label={`Edit ${displayName}`} onClick={() => startEdit(society)} disabled={isBusy}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button type="button" className="lwe-icon-button" title="Delete" aria-label={`Delete ${displayName}`} onClick={() => remove(society)} disabled={isBusy}>
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

/** Full CRUD on Membership — the canonical Actor<->Society link (roles/
 * status/trust), not the flat GET /societies/{id}/members summary this
 * used to read from (no membership_id, so nothing to PATCH/DELETE
 * against). "Edit" replaces every existing role with the one typed in —
 * good enough for the common single-role case without a full multi-role
 * picker; POST .../roles + DELETE .../roles/{role} is what the real API
 * actually offers for role mutation, there's no PATCH-the-role-list route. */
function MembershipsTable({ societyId, actorsById, refreshSeq }: { societyId: string; actorsById: Map<string, Actor>; refreshSeq: number }) {
  const bumpRefresh = useRefreshStore((s) => s.bumpRefresh)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'type' | 'role' | 'status'>('name')
  const [ascending, setAscending] = useState(true)

  const [adding, setAdding] = useState(false)
  const [newActorId, setNewActorId] = useState('')
  const [newRole, setNewRole] = useState('member')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSocietyMemberships(societyId)
      // GET /memberships/society/{id} returns every membership record ever
      // written (append-only timeline), including ones DELETE already
      // terminated — only "active" is a real, current member of this society.
      .then((result) => { if (!cancelled) { setMemberships(result.filter((m) => m.status === 'active')); setError('') } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [societyId, refreshSeq])

  const availableActors = useMemo(() => {
    const memberIds = new Set(memberships.map((m) => m.actor_id))
    return [...actorsById.values()].filter((a) => !memberIds.has(a.actor_id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [memberships, actorsById])

  const sort = (key: 'name' | 'type' | 'role' | 'status') => {
    if (sortKey === key) setAscending((value) => !value)
    else { setSortKey(key); setAscending(true) }
  }

  const visible = useMemo(() => {
    const name = (m: Membership) => actorsById.get(m.actor_id)?.name ?? m.actor_id
    const type = (m: Membership) => actorsById.get(m.actor_id)?.actor_type || 'actor'
    const sortValue = (m: Membership) =>
      sortKey === 'type' ? type(m) : sortKey === 'role' ? (m.roles.join(', ') || '') : sortKey === 'status' ? m.status : name(m)
    return memberships
      .filter((m) => `${name(m)} ${type(m)} ${m.roles.join(' ')} ${m.status}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => (sortValue(a).toLowerCase().localeCompare(sortValue(b).toLowerCase()) || name(a).localeCompare(name(b))) * (ascending ? 1 : -1))
  }, [memberships, actorsById, query, sortKey, ascending])

  const submitAdd = async () => {
    if (!newActorId) return
    setFormError('')
    setBusyId('__create__')
    try {
      await createMembership({ actor_id: newActorId, society_id: societyId, role: newRole.trim() || 'member' })
      setNewActorId('')
      setNewRole('member')
      setAdding(false)
      bumpRefresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const startEdit = (membership: Membership) => {
    setEditingId(membership.membership_id)
    setEditRole(membership.roles[0] ?? 'member')
    setFormError('')
  }

  const submitEdit = async (membership: Membership) => {
    const nextRole = editRole.trim()
    if (!nextRole) return
    setFormError('')
    setBusyId(membership.membership_id)
    try {
      if (!membership.roles.includes(nextRole)) await addMembershipRole(membership.membership_id, nextRole)
      for (const oldRole of membership.roles) {
        if (oldRole !== nextRole) await removeMembershipRole(membership.membership_id, oldRole)
      }
      setEditingId(null)
      bumpRefresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (membership: Membership) => {
    const name = actorsById.get(membership.actor_id)?.name ?? membership.actor_id
    if (!window.confirm(`Remove ${name} from this society?`)) return
    setFormError('')
    setBusyId(membership.membership_id)
    try {
      await deleteMembership(membership.membership_id)
      bumpRefresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
      setBusyId(null)
    }
  }

  return <section className="lwe-agents-group">
    <div className="lwe-agents-group-heading">
      <h2>Actors in selected society <span>{loading ? '…' : visible.length}</span></h2>
      <div className="lwe-agents-heading-actions">
        <input aria-label="Search actors in selected society" placeholder="Search actors…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="lwe-agents-add-button" onClick={() => { setAdding((v) => !v); setFormError('') }}>{adding ? 'Cancel' : '+ Add actor'}</button>
      </div>
    </div>
    <div className="lwe-agents-sort">
      <span>Sort:</span>
      {(['name', 'type', 'role', 'status'] as const).map((key) => <button type="button" key={key} onClick={() => sort(key)}>{key === 'name' ? 'Name' : key === 'type' ? 'Type' : key === 'role' ? 'Role' : 'Status'} {sortKey === key ? (ascending ? '↑' : '↓') : ''}</button>)}
    </div>

    {adding && <div className="lwe-agents-inline-form">
      <select aria-label="Actor to add" value={newActorId} onChange={(e) => setNewActorId(e.target.value)}>
        <option value="">Select an actor…</option>
        {availableActors.map((a) => <option key={a.actor_id} value={a.actor_id}>{a.name} ({a.actor_type || 'actor'})</option>)}
      </select>
      <input aria-label="Role" placeholder="Role (e.g. member)" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
      <button type="button" onClick={submitAdd} disabled={busyId === '__create__' || !newActorId}>{busyId === '__create__' ? 'Adding…' : 'Add'}</button>
    </div>}

    {error && <div className="lwe-inspector-error">Unable to load society actors: {error}</div>}
    {formError && <div className="lwe-inspector-error">{formError}</div>}

    {!error && !loading && visible.length === 0 && <div className="lwe-inspector-muted">{memberships.length === 0 ? 'No actors in this society.' : 'No matching actors.'}</div>}
    {!error && visible.length > 0 && <div className="lwe-inspector-table-wrap"><table className="lwe-inspector-table">
      <thead><tr><th>Actor</th><th>Type</th><th>Role</th><th>Status</th><th>Trust</th><th className="lwe-agents-actions-header">Actions</th></tr></thead>
      <tbody>
        {visible.map((membership) => {
          const actor = actorsById.get(membership.actor_id)
          const name = actor?.name ?? membership.actor_id
          const isEditing = editingId === membership.membership_id
          const isBusy = busyId === membership.membership_id
          return isEditing ? (
            <tr key={membership.membership_id}>
              <td>{name}</td>
              <td>{actor?.actor_type || 'actor'}</td>
              <td><input aria-label="Edit role" value={editRole} onChange={(e) => setEditRole(e.target.value)} /></td>
              <td>{membership.status}</td>
              <td>{membership.trust_score.toFixed(2)}</td>
              <td className="lwe-agents-row-actions">
                <button type="button" onClick={() => submitEdit(membership)} disabled={isBusy || !editRole.trim()}>{isBusy ? 'Saving…' : 'Save'}</button>
                <button type="button" onClick={() => setEditingId(null)} disabled={isBusy}>Cancel</button>
              </td>
            </tr>
          ) : (
            <tr key={membership.membership_id}>
              <td>{name}</td>
              <td>{actor?.actor_type || 'actor'}</td>
              <td>{membership.roles.join(', ') || 'Not available'}</td>
              <td>{membership.status}</td>
              <td>{membership.trust_score.toFixed(2)}</td>
              <td className="lwe-agents-row-actions">
                <button type="button" className="lwe-icon-button" title="Edit role" aria-label={`Edit role for ${name}`} onClick={() => startEdit(membership)} disabled={isBusy}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button type="button" className="lwe-icon-button" title="Remove" aria-label={`Remove ${name}`} onClick={() => remove(membership)} disabled={isBusy}>
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

export function SocietiesPanel() {
  const refreshSeq = useRefreshStore((state) => state.refreshSeq)
  const tickSeq = useCycleStore((state) => state.tickSeq)
  const coordinatingSocietyIds = useCycleStore((state) => state.coordinatingSocietyIds)
  const selectedSocietyId = useWorldStore((state) => state.selectedSocietyId)
  const selectSociety = useWorldStore((state) => state.selectSociety)
  const [societies, setSocieties] = useState<Society[]>([])
  const [societiesError, setSocietiesError] = useState('')
  const [actorsById, setActorsById] = useState<Map<string, Actor>>(new Map())

  useEffect(() => {
    let cancelled = false
    fetchSocieties()
      .then((result) => { if (!cancelled) { setSocieties(result); setSocietiesError('') } })
      .catch((err) => { if (!cancelled) setSocietiesError(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
    // Real ticks can create/activate societies — refetch after one so a
    // newly-coordinating society isn't missing from the list.
  }, [tickSeq, refreshSeq])

  useEffect(() => {
    let cancelled = false
    fetchActors().then((result) => {
      if (cancelled) return
      const map = new Map<string, Actor>()
      for (const actor of result) map.set(actor.actor_id, actor)
      setActorsById(map)
    }).catch(() => { /* the membership section's own error state covers this */ })
    return () => { cancelled = true }
  }, [refreshSeq])

  return <div className="lwe-inspector lwe-agents-content">
    <SocietyGraphPanel />
    <div className="lwe-inspector-tier">Registered societies</div>
    {societiesError && <div className="lwe-inspector-error">{societiesError}</div>}
    {!societiesError && <EditableSocietyTable societies={societies} coordinatingSocietyIds={coordinatingSocietyIds} onSelect={selectSociety} />}
    {selectedSocietyId && <MembershipsTable societyId={selectedSocietyId} actorsById={actorsById} refreshSeq={refreshSeq} />}
  </div>
}
