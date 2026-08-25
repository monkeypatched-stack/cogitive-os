import { useEffect, useMemo, useState } from 'react'
import {
  addMembershipRole, createActorAffiliation, deleteActorAffiliation, deleteMembership, fetchActorAffiliations,
  fetchActorMemberships, fetchActors, fetchSocieties, societyDisplayName, updateActorAffiliation, updateMembershipTrust,
  type Actor, type ActorAffiliation, type ActorMembership,
} from '../api/actorClient'

interface GraphEdge {
  source: Actor
  id: string
  targetId: string
  targetName: string
  type: string
  trust: number | null
  category: string
  validFrom: string
  kind: 'Explicit affiliation' | 'Society membership'
  affiliation?: ActorAffiliation
  membershipId?: string
}

function explicitActorEdge(source: Actor, affiliation: ActorAffiliation, target: Actor): GraphEdge {
  return {
    source, id: affiliation.affiliation_id, targetId: target.actor_id, affiliation,
    targetName: target.name, type: affiliation.affiliation_type,
    trust: affiliation.trust_level, category: affiliation.category || target.actor_type,
    validFrom: affiliation.valid_from, kind: 'Explicit affiliation',
  }
}

function membershipEdge(source: Actor, membership: ActorMembership, societyNames: Map<string, string>): GraphEdge {
  const targetId = membership.society_id || membership.team_id || 'unknown'
  return {
    source, id: `membership:${source.actor_id}:${targetId}`,
    targetId, targetName: societyNames.get(targetId) || targetId,
    type: membership.society_id ? 'society membership' : 'team membership',
    trust: typeof membership.trust_score === 'number' ? membership.trust_score : null,
    category: [membership.roles?.join(', '), membership.status].filter(Boolean).join(' · ') || 'Membership',
    validFrom: typeof membership.start_time === 'number' ? new Date(membership.start_time * 1000).toISOString().slice(0, 10) : '',
    kind: 'Society membership', membershipId: membership.membership_id,
  }
}

/** Graph visual language — tiers, badge palette, icons, and layout math for
 * the radial relationship graph. Purely presentational: none of this
 * changes what edges exist or what the CRUD table below does. */
type Tier = 1 | 2 | 3
const PERSONAL_TYPES = ['family', 'friendship', 'roommate', 'marriage']
const ORG_TYPES = ['employed_by', 'employment', 'customer', 'supplier', 'manages', 'contractor', 'vendor']
function tierOf(edge: GraphEdge): Tier {
  const t = edge.type.toLowerCase()
  if (PERSONAL_TYPES.some((p) => t.includes(p))) return 1
  if (ORG_TYPES.some((p) => t.includes(p))) return 2
  return 3
}
const TIER_LABEL: Record<Tier, string> = { 1: 'Immediate relationships', 2: 'Organizations', 3: 'Communities' }
const TIER_RADIUS: Record<Tier, number> = { 1: 210, 2: 320, 3: 415 }
const TIER_CARD: Record<Tier, { w: number; h: number }> = { 1: { w: 176, h: 68 }, 2: { w: 158, h: 58 }, 3: { w: 138, h: 46 } }

type Palette = { bg: string; fg: string; dot: string }
const RELATIONSHIP_PALETTE: Array<[string, Palette]> = [
  ['family', { bg: '#DCFCE7', fg: '#15803D', dot: '#22C55E' }],
  ['friendship', { bg: '#DCFCE7', fg: '#15803D', dot: '#22C55E' }],
  ['roommate', { bg: '#DCFCE7', fg: '#15803D', dot: '#22C55E' }],
  ['son_of', { bg: '#DCFCE7', fg: '#15803D', dot: '#22C55E' }],
  ['daughter_of', { bg: '#DCFCE7', fg: '#15803D', dot: '#22C55E' }],
  ['sibling_of', { bg: '#DCFCE7', fg: '#15803D', dot: '#22C55E' }],
  ['marriage', { bg: '#DCFCE7', fg: '#15803D', dot: '#22C55E' }],
  ['customer', { bg: '#DBEAFE', fg: '#1D4ED8', dot: '#2563EB' }],
  ['supplier', { bg: '#DBEAFE', fg: '#1D4ED8', dot: '#2563EB' }],
  ['employ', { bg: '#FEF3C7', fg: '#B45309', dot: '#F59E0B' }],
  ['manages', { bg: '#FEF3C7', fg: '#B45309', dot: '#F59E0B' }],
  ['member', { bg: '#EDE9FE', fg: '#6D28D9', dot: '#94A3B8' }],
]
const DEFAULT_PALETTE: Palette = { bg: '#F1F5F9', fg: '#475569', dot: '#94A3B8' }
function relationshipStyle(type: string): Palette {
  const t = type.toLowerCase()
  return RELATIONSHIP_PALETTE.find(([key]) => t.includes(key))?.[1] || DEFAULT_PALETTE
}

/** A soft, monochrome 20px glyph per node category — human vs. an
 * organization (enterprise/store) vs. a community (society/membership). */
function nodeIcon(edge: GraphEdge) {
  const key = `${edge.category} ${edge.source.actor_type}`.toLowerCase()
  if (edge.kind === 'Society membership' || edge.type.includes('member')) {
    return <><circle cx="7.5" cy="8.5" r="2.6" /><circle cx="16.5" cy="8.5" r="2.6" /><path d="M2.5 19c0-3 2.5-5 5-5s5 2 5 5M11.5 19c0-3 2.5-5 5-5s5 2 5 5" /></>
  }
  if (key.includes('enterprise') || key.includes('commercial') || key.includes('store')) {
    return <path d="M4 20.5V9.5l8-5 8 5v11M4 20.5h16M9.5 20.5v-6h5v6" />
  }
  return <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" /></>
}

/** Gentle bezier arc between two points, bowed perpendicular to the chord
 * so lines never run straight through card text along the way. */
function curvedPath(x1: number, y1: number, x2: number, y2: number, bend: number) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const cx = mx + (-dy / len) * bend, cy = my + (dx / len) * bend
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
}

interface LaidOutNode { edge: GraphEdge; x: number; y: number; tier: Tier; w: number; h: number }
function layoutGraph(edges: GraphEdge[], centerX: number, centerY: number): LaidOutNode[] {
  const byTier = new Map<Tier, GraphEdge[]>([[1, []], [2, []], [3, []]])
  edges.forEach((edge) => byTier.get(tierOf(edge))!.push(edge))
  const nodes: LaidOutNode[] = []
  byTier.forEach((tierEdges, tier) => {
    const radius = TIER_RADIUS[tier]
    const { w, h } = TIER_CARD[tier]
    tierEdges.forEach((edge, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(tierEdges.length, 1)) * Math.PI * 2
      nodes.push({ edge, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius, tier, w, h })
    })
  })
  return nodes
}

const todayIso = () => new Date().toISOString().slice(0, 10)

export function AffiliationsPanel() {
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [actors, setActors] = useState<Actor[]>([])
  const [societyNames, setSocietyNames] = useState<Map<string, string>>(new Map())
  const [selectedActorId, setSelectedActorId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<'target' | 'relationship' | 'trust'>('target')
  const [ascending, setAscending] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [form, setForm] = useState({ target_id: '', affiliation_type: 'friendship', trust_level: '0.5', valid_from: todayIso(), valid_until: '' })
  const [membershipForm, setMembershipForm] = useState({ role: '', trust_level: '0.5' })
  const [typeFilter, setTypeFilter] = useState('all')

  // Actor/society roster — loaded once, independent of which human is
  // selected. Defaults the picker to Priya Sharma (the primary demo
  // actor) when present, otherwise the first human actor, so the graph
  // renders something on first load rather than starting empty.
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchActors(), fetchSocieties()])
      .then(([fetchedActors, societies]) => {
        if (cancelled) return
        // fetchActors() hits the legacy /planet/actors route, which emits
        // one row per (actor, society) membership rather than one row per
        // actor (see its own doc comment in actorClient.ts) — dedupe by
        // actor_id, the same workaround every other caller of it already
        // applies.
        const actors = Array.from(new Map(fetchedActors.map((actor) => [actor.actor_id, actor])).values())
        setActors(actors)
        setSocietyNames(new Map(societies.map((society) => [society.society_id, societyDisplayName(society.name)])))
        setSelectedActorId((current) => {
          if (current && actors.some((actor) => actor.actor_id === current)) return current
          const humans = actors.filter((actor) => actor.actor_type === 'human')
          const priya = humans.find((actor) => actor.name.toLowerCase() === 'priya sharma')
          return (priya || humans[0])?.actor_id || ''
        })
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [])

  const selectedActor = actors.find((actor) => actor.actor_id === selectedActorId) || null
  const humanActors = useMemo(() => actors.filter((actor) => actor.actor_type === 'human'), [actors])

  useEffect(() => {
    if (!selectedActor) return
    let cancelled = false
    setLoading(true)
    const actorsById = new Map(actors.map((actor) => [actor.actor_id, actor]))
    const actorsByName = new Map(actors.map((actor) => [actor.name.toLowerCase(), actor]))
    Promise.allSettled([
      fetchActorAffiliations(selectedActor.actor_id), fetchActorMemberships(selectedActor.actor_id),
    ])
      .then(([affiliationsResult, membershipsResult]) => {
        const explicitAffiliations = affiliationsResult.status === 'fulfilled' ? affiliationsResult.value : []
        const memberships = membershipsResult.status === 'fulfilled' ? membershipsResult.value : []
        const explicitEdges = explicitAffiliations.flatMap((affiliation) => {
          const target = actorsById.get(affiliation.target_id) || actorsByName.get(affiliation.target_name.toLowerCase())
          return target && target.actor_id !== selectedActor.actor_id ? [explicitActorEdge(selectedActor, affiliation, target)] : []
        })
        return [...explicitEdges, ...memberships
          .filter((membership) => Boolean(membership.society_id))
          .map((membership) => membershipEdge(selectedActor, membership, societyNames))
        ]
      })
      .then((result) => { if (!cancelled) { setEdges(result); setError('') } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedActorId, reload])

  const actorTargets = actors.filter((actor) => actor.actor_id !== selectedActor?.actor_id)
  const edgeTypes = useMemo(() => Array.from(new Set(edges.map((edge) => edge.type))).sort(), [edges])
  const visibleEdges = useMemo(() => {
    const normalizedQuery = query.toLowerCase()
    const sortValue = (edge: GraphEdge) => sortKey === 'relationship' ? `${edge.kind} ${edge.type}` : sortKey === 'trust' ? String(edge.trust ?? -1) : edge.targetName
    return edges
      .filter((edge) => typeFilter === 'all' || edge.type === typeFilter)
      .filter((edge) => `${edge.source.name} ${edge.targetName} ${edge.type} ${edge.category}`.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const result = sortValue(a).localeCompare(sortValue(b), undefined, sortKey === 'trust' ? { numeric: true } : undefined)
        return (result || a.targetName.localeCompare(b.targetName)) * (ascending ? 1 : -1)
      })
  }, [edges, query, sortKey, ascending, typeFilter])
  const sort = (key: 'target' | 'relationship' | 'trust') => {
    if (sortKey === key) setAscending((value) => !value)
    else { setSortKey(key); setAscending(true) }
  }
  const resetForm = () => {
    setForm({ target_id: '', affiliation_type: 'friendship', trust_level: '0.5', valid_from: todayIso(), valid_until: '' })
    setMembershipForm({ role: '', trust_level: '0.5' })
    setEditingId(null)
    setAdding(false)
  }
  const saveAffiliation = async () => {
    if (!selectedActor || !form.target_id || !form.affiliation_type.trim()) return
    setBusyId(editingId || '__create__'); setFormError('')
    try {
      const input = {
        affiliation_type: form.affiliation_type.trim(), target_id: form.target_id,
        target_name: actors.find((actor) => actor.actor_id === form.target_id)?.name || form.target_id,
        trust_level: Number(form.trust_level), valid_from: form.valid_from, valid_until: form.valid_until,
      }
      if (editingId) await updateActorAffiliation(selectedActor.actor_id, editingId, input)
      else await createActorAffiliation(selectedActor.actor_id, input)
      resetForm(); setReload((value) => value + 1)
    } catch (err) { setFormError(err instanceof Error ? err.message : String(err)) }
    finally { setBusyId(null) }
  }
  const removeAffiliation = async (edge: GraphEdge) => {
    if (!selectedActor || !edge.affiliation || !window.confirm(`Delete ${edge.type} affiliation with ${edge.targetName}?`)) return
    setBusyId(edge.id); setFormError('')
    try { await deleteActorAffiliation(selectedActor.actor_id, edge.id); setReload((value) => value + 1) }
    catch (err) { setFormError(err instanceof Error ? err.message : String(err)) }
    finally { setBusyId(null) }
  }
  const saveMembership = async (edge: GraphEdge) => {
    if (!edge.membershipId) return
    setBusyId(editingId || edge.id); setFormError('')
    try {
      if (membershipForm.role.trim()) await addMembershipRole(edge.membershipId, membershipForm.role.trim())
      await updateMembershipTrust(edge.membershipId, Number(membershipForm.trust_level))
      resetForm(); setReload((value) => value + 1)
    } catch (err) { setFormError(err instanceof Error ? err.message : String(err)) }
    finally { setBusyId(null) }
  }
  const removeMembership = async (edge: GraphEdge) => {
    if (!edge.membershipId || !window.confirm(`Remove membership in ${edge.targetName}?`)) return
    setBusyId(edge.id); setFormError('')
    try { await deleteMembership(edge.membershipId); setReload((value) => value + 1) }
    catch (err) { setFormError(err instanceof Error ? err.message : String(err)) }
    finally { setBusyId(null) }
  }

  return <div className="lwe-inspector lwe-agents-content lwe-affiliations-page">
    <div className="lwe-inspector-tier">Registered affiliations</div>
    {error && <div className="lwe-inspector-error">Unable to load affiliations: {error}</div>}
    {!error && <>
      <section className="lwe-agents-group lwe-affiliation-graph-section">
        <div className="lwe-agents-group-heading">
          <h2>Affiliation graph <span>{loading ? '…' : edges.length}</span></h2>
          <select
            aria-label="Actor to show the affiliation graph for"
            className="lwe-affiliation-actor-select"
            value={selectedActorId}
            onChange={(event) => setSelectedActorId(event.target.value)}
          >
            {humanActors.map((actor) => <option key={actor.actor_id} value={actor.actor_id}>{actor.name}</option>)}
          </select>
        </div>
        <div className="lwe-affiliation-graph" aria-label={`Affiliation graph for ${selectedActor?.name ?? ''}`}>
          {edges.length > 0 && selectedActor ? (() => {
            const centerX = 620, centerY = 460
            const laidOut = layoutGraph(edges, centerX, centerY)
            const activeId = focusedId ?? hoveredId
            return <svg className="lwe-affiliation-svg" viewBox="0 0 1240 920" role="img" aria-label={`${selectedActor.name} relationship graph`}>
              <defs>
                <radialGradient id="lwe-primary-gradient" cx="35%" cy="30%" r="75%">
                  <stop offset="0%" stopColor="#4C7FF0" />
                  <stop offset="100%" stopColor="#2049C4" />
                </radialGradient>
                <filter id="lwe-card-shadow" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="2" stdDeviation="6" floodColor="#0F172A" floodOpacity="0.08" />
                </filter>
                <filter id="lwe-primary-shadow" x="-60%" y="-60%" width="220%" height="220%">
                  <feDropShadow dx="0" dy="10" stdDeviation="18" floodColor="#2049C4" floodOpacity="0.28" />
                </filter>
              </defs>

              {laidOut.map(({ edge, x, y, tier }) => {
                const isActive = activeId === edge.id
                const dimmed = activeId !== null && !isActive
                const bend = (28 + tier * 10) * (edge.targetName.charCodeAt(0) % 2 === 0 ? 1 : -1)
                const palette = relationshipStyle(edge.type)
                return <path key={`edge:${edge.id}`}
                  className="lwe-affiliation-edge"
                  d={curvedPath(centerX, centerY, x, y, bend)}
                  style={{ opacity: dimmed ? 0.25 : 1, stroke: isActive ? palette.dot : undefined }}
                />
              })}

              {laidOut.map(({ edge, x, y, tier, w, h }) => {
                const isActive = activeId === edge.id
                const dimmed = activeId !== null && !isActive
                const palette = relationshipStyle(edge.type)
                const toggleFocus = () => setFocusedId((current) => current === edge.id ? null : edge.id)
                return <g
                  key={`node:${edge.source.actor_id}:${edge.id}`}
                  className={`lwe-affiliation-node-g lwe-affiliation-tier-${tier}${isActive ? ' is-active' : ''}`}
                  style={{ opacity: dimmed ? 0.4 : 1, transformOrigin: `${x}px ${y}px` }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${edge.targetName}, ${edge.type}${edge.trust !== null ? `, trust ${edge.trust.toFixed(2)}` : ''}`}
                  onMouseEnter={() => setHoveredId(edge.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(edge.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={toggleFocus}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleFocus() } }}
                >
                  <rect className="lwe-affiliation-card" x={x - w / 2} y={y - h / 2} width={w} height={h} rx={16}
                    filter="url(#lwe-card-shadow)" />
                  <g transform={`translate(${x - w / 2 + 14}, ${y - 9})`} className="lwe-affiliation-icon">
                    <g transform="scale(0.72)">{nodeIcon(edge)}</g>
                  </g>
                  <text className="lwe-affiliation-svg-label" x={x - w / 2 + 40} y={y - h / 2 + 24} textAnchor="start">
                    {edge.targetName.length > 20 ? `${edge.targetName.slice(0, 19)}…` : edge.targetName}
                  </text>
                  <g transform={`translate(${x - w / 2 + 40}, ${y - h / 2 + 36})`}>
                    <rect width={Math.min(10 + edge.type.length * 5.4, w - 54)} height={16} rx={8} fill={palette.bg} />
                    <text x={7} y={11.5} className="lwe-affiliation-chip-text" fill={palette.fg}>
                      {edge.type.length > 16 ? `${edge.type.slice(0, 15)}…` : edge.type}
                    </text>
                  </g>
                  <circle className="lwe-affiliation-status-dot" cx={x + w / 2 - 12} cy={y - h / 2 + 12} r={3.5} fill={palette.dot} />
                  <text className={`lwe-affiliation-edge-label${isActive ? ' is-visible' : ''}`}
                    x={x} y={y + h / 2 + 16} textAnchor="middle">
                    {edge.kind === 'Society membership' ? 'Society membership' : edge.type}
                  </text>
                </g>
              })}

              <g filter="url(#lwe-primary-shadow)">
                <circle cx={centerX} cy={centerY} r={64} fill="url(#lwe-primary-gradient)" />
              </g>
              <g className="lwe-affiliation-primary-icon" transform={`translate(${centerX - 20}, ${centerY - 46})`}>
                <circle cx="20" cy="14" r="9" fill="#fff" fillOpacity="0.9" />
                <path d="M4 40c0-9.4 7.2-17 16-17s16 7.6 16 17" fill="#fff" fillOpacity="0.9" />
              </g>
              <text className="lwe-affiliation-primary-name" x={centerX} y={centerY + 26} textAnchor="middle">{selectedActor.name}</text>
              <g transform={`translate(${centerX - 30}, ${centerY + 36})`}>
                <rect width={60} height={18} rx={9} fill="#EEF2FF" />
                <text x={30} y={12.5} textAnchor="middle" className="lwe-affiliation-primary-badge">{selectedActor.actor_type || 'human'}</text>
              </g>
              <circle cx={centerX + 46} cy={centerY + 45} r={4} fill="#22C55E" />
            </svg>
          })() : <div className="lwe-inspector-muted">No affiliations or Society memberships recorded for {selectedActor?.name ?? 'this actor'}.</div>}
        </div>
        {edges.length > 0 && <div className="lwe-affiliation-tier-legend">
          {([1, 2, 3] as const).map((tier) => <span key={tier} className={`lwe-affiliation-tier-chip lwe-affiliation-tier-${tier}`}>{TIER_LABEL[tier]}</span>)}
        </div>}
      </section>
      <section className="lwe-agents-group lwe-affiliation-table-section">
        <div className="lwe-agents-group-heading">
          <h2>Affiliations <span>{visibleEdges.length}</span></h2>
          <div className="lwe-agents-heading-actions">
            <select aria-label="Filter by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">All types</option>
              {edgeTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <input aria-label="Search affiliations" placeholder="Search affiliations…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <button type="button" className="lwe-agents-add-button" onClick={() => { resetForm(); setAdding(true) }}>{adding ? 'Cancel' : '+ Add affiliation'}</button>
          </div>
        </div>
        <div className="lwe-agents-sort">
          <span>Sort:</span>
          {(['target', 'relationship', 'trust'] as const).map((key) => <button type="button" key={key} onClick={() => sort(key)}>{key === 'target' ? 'Target' : key === 'relationship' ? 'Relationship' : 'Trust'} {sortKey === key ? (ascending ? '↑' : '↓') : ''}</button>)}
        </div>
        {formError && <div className="lwe-inspector-error">{formError}</div>}
        {(() => {
          const editingEdge = editingId ? edges.find((edge) => edge.id === editingId) : undefined
          if (editingEdge && editingEdge.kind === 'Society membership') {
            return <div className="lwe-affiliation-form lwe-affiliation-form-membership">
              <span className="lwe-affiliation-form-target">Membership in {editingEdge.targetName}</span>
              <input aria-label="Add role" placeholder="Add role (optional)" value={membershipForm.role} onChange={(event) => setMembershipForm({ ...membershipForm, role: event.target.value })} />
              <input aria-label="Trust score" type="number" min="0" max="1" step="0.01" placeholder="Trust" value={membershipForm.trust_level} onChange={(event) => setMembershipForm({ ...membershipForm, trust_level: event.target.value })} />
              <button type="button" onClick={() => saveMembership(editingEdge)} disabled={Boolean(busyId)}>{busyId ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={resetForm} disabled={Boolean(busyId)}>Cancel</button>
            </div>
          }
          if (adding || editingId) {
            return <div className="lwe-affiliation-form">
              <select aria-label="Affiliation target" value={form.target_id} onChange={(event) => setForm({ ...form, target_id: event.target.value })}>
                <option value="">Select human or enterprise…</option>
                {actorTargets.map((actor) => <option key={actor.actor_id} value={actor.actor_id}>{actor.name} ({actor.actor_type || 'actor'})</option>)}
              </select>
              <input aria-label="Affiliation type" placeholder="Type (e.g. friendship)" value={form.affiliation_type} onChange={(event) => setForm({ ...form, affiliation_type: event.target.value })} />
              <input aria-label="Trust score" type="number" min="0" max="1" step="0.01" placeholder="Trust" value={form.trust_level} onChange={(event) => setForm({ ...form, trust_level: event.target.value })} />
              <input aria-label="Valid from" placeholder="Valid from" value={form.valid_from} onChange={(event) => setForm({ ...form, valid_from: event.target.value })} />
              <input aria-label="Valid until" placeholder="Valid until" value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} />
              <button type="button" onClick={saveAffiliation} disabled={Boolean(busyId) || !form.target_id}>{busyId ? 'Saving…' : editingId ? 'Save' : 'Create'}</button>
              <button type="button" onClick={resetForm} disabled={Boolean(busyId)}>Cancel</button>
            </div>
          }
          return null
        })()}
        <div className="lwe-inspector-table-wrap">
          <table className="lwe-inspector-table"><thead><tr>
            <th>Source</th><th>Relationship</th><th>Target</th><th>Roles / Status</th><th>Trust</th><th>Valid from</th><th>Actions</th>
          </tr></thead><tbody>
            {visibleEdges.map((edge) => <tr key={`${edge.source.actor_id}:${edge.id}`}>
              <td>{edge.source.name}</td>
              <td>{`${edge.kind} · ${edge.type}`}</td>
              <td>{edge.targetName}</td>
              <td>{edge.category}</td>
              <td>{edge.trust === null ? 'Not available' : edge.trust.toFixed(2)}</td>
              <td>{edge.validFrom || 'Not available'}</td>
              <td className="lwe-affiliation-actions lwe-agents-row-actions">
                <button type="button" className="lwe-icon-button" title="Edit" aria-label={`Edit ${edge.kind === 'Society membership' ? 'membership in' : 'affiliation with'} ${edge.targetName}`}
                  onClick={() => {
                    setAdding(false); setEditingId(edge.id)
                    if (edge.kind === 'Society membership') setMembershipForm({ role: '', trust_level: String(edge.trust ?? 0.5) })
                    else setForm({ target_id: edge.affiliation?.target_id || '', affiliation_type: edge.affiliation?.affiliation_type || '', trust_level: String(edge.affiliation?.trust_level ?? 0.5), valid_from: edge.affiliation?.valid_from || todayIso(), valid_until: edge.affiliation?.valid_until || '' })
                  }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button type="button" className="lwe-icon-button" title="Delete" aria-label={`Delete ${edge.kind === 'Society membership' ? 'membership in' : 'affiliation with'} ${edge.targetName}`}
                  onClick={() => edge.kind === 'Society membership' ? removeMembership(edge) : removeAffiliation(edge)} disabled={busyId === edge.id}>
                  {busyId === edge.id
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>}
                </button>
              </td>
            </tr>)}
            {!loading && visibleEdges.length === 0 && <tr><td colSpan={7}>No affiliations or memberships recorded.</td></tr>}
          </tbody></table>
        </div>
      </section>
    </>}
  </div>
}
