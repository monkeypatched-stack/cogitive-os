import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorldStore } from '../store/worldStore'
import { fetchAllActors, fetchActorMemberships, type Actor } from '../api/actorClient'
import { fetchActorCognitiveState, type ActorCognitiveState } from '../api/cognitiveClient'
import {
  fetchEffectivePermissions, fetchEffectivePolicies, fetchFraudStatus, fetchPrincipal, evaluatePolicy,
  fetchMembershipDelegations, revokeDelegation, delegationStatus, type Delegation,
  fetchPendingApproval, fetchPendingNegotiation, fetchStrategyNegotiation, fetchAuditTimeline,
  fetchSecurityViolations, type SecurityViolation,
  TRANSITION_GATE_STRATEGY,
  type PendingApproval, type PendingNegotiation, type StrategyNegotiation, type AuditTimeline, type EffectivePolicy,
  type FraudStatus,
} from '../api/securityClient'
import { ArchitectureVerificationPanel } from './ArchitectureVerificationPanel'
import { SECURITY_VERIFICATION } from '../data/architectureVerification'
import './SecurityPanel.css'

// SECURITY console — every view here is a direct read of a real backend
// endpoint (see api/securityClient.ts's own audit comment). Where the
// backend has no endpoint for something (a global violations feed, a
// global pending-negotiation list, provenance-tagged permissions), the
// UI says so explicitly rather than inventing data. Backend remains
// authoritative: nothing here computes an authorization/security
// decision — every decision shown is the backend's own.

type Tab = 'identity' | 'authorization' | 'delegations' | 'trace' | 'violations'
const TABS: { id: Tab; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'authorization', label: 'Authorization' },
  { id: 'delegations', label: 'Delegations' },
  { id: 'trace', label: 'Execution Trace' },
  { id: 'violations', label: 'Violations' },
]

function fmtTime(t: number | null | undefined): string {
  if (t === null || t === undefined) return '—'
  return new Date(t * 1000).toLocaleString()
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'neutral'; children: React.ReactNode }) {
  return <span className={`lwe-sec-pill lwe-sec-pill-${tone}`}>{children}</span>
}

function decidedTone(decided: boolean | null): { tone: 'ok' | 'warn' | 'bad'; label: string } {
  if (decided === null) return { tone: 'warn', label: 'PENDING' }
  return decided ? { tone: 'ok', label: 'ACCEPTED' } : { tone: 'bad', label: 'REJECTED' }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="lwe-sec-field"><span className="lwe-sec-field-label">{label}</span><span className="lwe-sec-field-value">{value}</span></div>
}

// ── Actor picker (this console is actor-scoped; reachable standalone
// from the nav, or already-scoped via the world-store selection an Actor
// drill-down sets, same pattern DataSourcesPanel already uses). ────────
function ActorPicker({ actors, actorId, onSelect }: { actors: Actor[]; actorId: string | null; onSelect: (id: string) => void }) {
  return <select className="lwe-sec-actor-select" value={actorId ?? ''} onChange={(e) => onSelect(e.target.value)} aria-label="Select actor">
    <option value="" disabled>Select an actor…</option>
    {actors.map((a) => <option key={a.actor_id} value={a.actor_id}>{a.name} ({a.actor_type})</option>)}
  </select>
}

// ── 1. Identity ──────────────────────────────────────────────────────
function IdentityTab({ actorId, cognitiveState }: { actorId: string; cognitiveState: ActorCognitiveState | null }) {
  const [fraud, setFraud] = useState<FraudStatus | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setFraud(null)
    fetchFraudStatus(actorId).then(setFraud).catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [actorId])

  const identity = cognitiveState?.identity
  return <div className="lwe-sec-tab">
    <p className="lwe-sec-tab-desc">Who this actor is, whether it's active, and its fraud-risk status — every value is a direct read from GET /actors/{'{id}'}/cognitive-state and GET /actors/{'{id}'}/fraud-status.</p>
    {error && <div className="lwe-sec-error">⚠ {error}</div>}
    <div className="lwe-sec-grid">
      <Field label="Actor ID" value={<code>{actorId}</code>} />
      <Field label="Name" value={identity?.name ?? '—'} />
      <Field label="Actor type" value={identity?.actor_type ?? '—'} />
      <Field label="Actor status" value={identity?.status ?? '—'} />
      <Field label="Identity active" value={identity ? <Pill tone={identity.is_active ? 'ok' : 'bad'}>{identity.is_active ? 'ACTIVE' : 'INACTIVE'}</Pill> : '—'} />
      <Field label="Cycle count" value={identity?.cycle_count ?? '—'} />
      <Field label="CognitiveOS instance" value="Single shared planetary runtime — this deployment does not partition actors across multiple runtime instances" />
      <Field label="Fraud risk" value={fraud ? <Pill tone={fraud.high_risk ? 'bad' : 'ok'}>{fraud.high_risk ? 'HIGH RISK' : 'CLEAR'} · score {(fraud.risk_score ?? 0).toFixed(2)}</Pill> : '…'} />
      <Field label="Velocity cooldown" value={fraud?.velocity_cooldown_until ? fmtTime(fraud.velocity_cooldown_until) : 'None active'} />
    </div>
    <div className="lwe-sec-gap-note">
      <b>Not available:</b> active session/credential list, revoked-token history, and creation/registration timestamp — no endpoint exposes these for an arbitrary actor from an admin console. Token revocation itself is real and enforced (services/auth/helpers/revocation.py, checked on every request) but not queryable.
    </div>
  </div>
}

// ── 2. Authorization ─────────────────────────────────────────────────
function AuthorizationTab({ actorId, delegations }: { actorId: string; delegations: Delegation[] }) {
  const [permissions, setPermissions] = useState<string[] | null>(null)
  const [policies, setPolicies] = useState<EffectivePolicy[] | null>(null)
  const [principal, setPrincipal] = useState<{ authenticated: boolean } | null>(null)
  const [error, setError] = useState('')
  const [evalAction, setEvalAction] = useState('query')
  const [evalResource, setEvalResource] = useState('')
  const [evalResult, setEvalResult] = useState<Record<string, unknown> | null>(null)
  const [evalBusy, setEvalBusy] = useState(false)

  useEffect(() => {
    setPermissions(null); setPolicies(null); setError('')
    Promise.all([fetchEffectivePermissions(actorId), fetchEffectivePolicies(actorId)])
      .then(([p, pol]) => { setPermissions(p); setPolicies(pol) })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    fetchPrincipal().then(setPrincipal).catch(() => setPrincipal(null))
  }, [actorId])

  const delegatedPermissionSet = useMemo(() => {
    const set = new Set<string>()
    for (const d of delegations) if (delegationStatus(d) === 'ACTIVE') for (const p of d.permissions) set.add(p)
    return set
  }, [delegations])

  const runEval = async () => {
    setEvalBusy(true)
    try { setEvalResult(await evaluatePolicy(evalAction, evalResource) as unknown as Record<string, unknown>) }
    catch (err) { setEvalResult({ error: err instanceof Error ? err.message : String(err) }) }
    finally { setEvalBusy(false) }
  }

  return <div className="lwe-sec-tab">
    <p className="lwe-sec-tab-desc">Effective authorization state — GET /actors/{'{id}'}/effective-permissions and /effective-policies, the union across every active membership. The backend does not tag each permission's source, so a permission is marked <b>Delegated</b> only when it also appears in one of this actor's own active delegation records below; everything else is labeled <b>Effective</b> without asserting direct-vs-policy-derived provenance the backend doesn't expose.</p>
    {error && <div className="lwe-sec-error">⚠ {error}</div>}

    <p className="lwe-sec-subhead">Effective permissions ({permissions?.length ?? '…'})</p>
    <div className="lwe-sec-chip-row">
      {permissions === null && <span className="lwe-sec-muted">Loading…</span>}
      {permissions?.length === 0 && <span className="lwe-sec-muted">None granted.</span>}
      {permissions?.map((p) => <span className="lwe-sec-chip" key={p}>{p}{delegatedPermissionSet.has(p) && <Pill tone="neutral">DELEGATED</Pill>}</span>)}
    </div>

    <p className="lwe-sec-subhead">Effective policies ({policies?.length ?? '…'})</p>
    <div className="lwe-sec-chip-row">
      {policies?.length === 0 && <span className="lwe-sec-muted">None.</span>}
      {policies?.map((pol, i) => <span className="lwe-sec-chip" key={pol.policy_id ?? i}>{pol.name ?? pol.policy_id ?? JSON.stringify(pol)}</span>)}
    </div>

    <div className="lwe-sec-eval-card">
      <p className="lwe-sec-subhead">Live policy evaluation (POST /policy/evaluate)</p>
      <p className="lwe-sec-eval-caveat">
        This evaluates the <b>current browser session's own resolved principal</b> — this dev deployment sends no Bearer token, so it will resolve as {principal?.authenticated ? 'authenticated' : 'anonymous'}, not the actor selected above. It is a real backend decision (never computed here), useful as a policy-engine connectivity check — not a per-actor authorization simulator, since the backend endpoint has no actor_id parameter.
      </p>
      <div className="lwe-sec-eval-row">
        <input aria-label="Action" placeholder="action, e.g. Payment" value={evalAction} onChange={(e) => setEvalAction(e.target.value)} />
        <input aria-label="Resource" placeholder="resource, e.g. order_456" value={evalResource} onChange={(e) => setEvalResource(e.target.value)} />
        <button type="button" onClick={runEval} disabled={evalBusy}>{evalBusy ? 'Evaluating…' : 'Evaluate'}</button>
      </div>
      {evalResult && <pre className="lwe-sec-raw">{JSON.stringify(evalResult, null, 2)}</pre>}
    </div>
  </div>
}

// ── 3. Delegations ───────────────────────────────────────────────────
function DelegationsTab({ actorId, delegations, loading, error, onRevoke }: {
  actorId: string; delegations: Delegation[]; loading: boolean; error: string; onRevoke: (id: string) => Promise<void>
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const revoke = async (d: Delegation) => {
    if (!window.confirm(`Revoke delegation ${d.delegation_id} (to ${d.delegate_actor_id})? This cannot be undone.`)) return
    setBusyId(d.delegation_id)
    try { await onRevoke(d.delegation_id) } finally { setBusyId(null) }
  }
  return <div className="lwe-sec-tab">
    <p className="lwe-sec-tab-desc">"Actor <code>{actorId}</code>'s membership may act for another actor" — not just "has a permission." Real records from GET /memberships/{'{id}'}/delegations across every active membership this actor holds. There is no global "all delegations" endpoint, so this list is scoped to this one actor's own memberships.</p>
    {error && <div className="lwe-sec-error">⚠ {error}</div>}
    {loading && <div className="lwe-sec-muted">Loading…</div>}
    {!loading && delegations.length === 0 && !error && <div className="lwe-sec-muted">No delegations on any active membership.</div>}
    {delegations.length > 0 && <div className="lwe-sec-table-wrap"><table className="lwe-sec-table">
      <thead><tr><th>Delegate</th><th>Permissions</th><th>Reason</th><th>Valid from</th><th>Valid until</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {delegations.map((d) => {
          const status = delegationStatus(d)
          const tone = status === 'ACTIVE' ? 'ok' : status === 'PENDING' ? 'warn' : 'neutral'
          return <tr key={d.delegation_id}>
            <td><code>{d.delegate_actor_id}</code></td>
            <td>{d.permissions.join(', ') || '—'}</td>
            <td>{d.reason || '—'}</td>
            <td>{fmtTime(d.valid_from)}</td>
            <td>{d.valid_until ? fmtTime(d.valid_until) : 'No expiry'}</td>
            <td><Pill tone={tone}>{status}</Pill></td>
            <td>{status === 'ACTIVE' && <button type="button" className="lwe-sec-btn-danger" disabled={busyId === d.delegation_id} onClick={() => revoke(d)}>{busyId === d.delegation_id ? 'Revoking…' : 'Revoke'}</button>}</td>
          </tr>
        })}
      </tbody>
    </table></div>}
  </div>
}

// ── 4. Execution Trace (Consent, Negotiation×2, Policy Decisions,
// TransitionGate, Audit — all real, all scoped to one chosen execution). ─
function ExecutionTraceTab({ actorId, cognitiveState }: { actorId: string; cognitiveState: ActorCognitiveState | null }) {
  const executions = cognitiveState?.execution_history ?? []
  const [executionId, setExecutionId] = useState('')
  const [approval, setApproval] = useState<PendingApproval | null | undefined>(undefined)
  const [negotiation, setNegotiation] = useState<PendingNegotiation | null | undefined>(undefined)
  const [strategy, setStrategy] = useState<StrategyNegotiation | null>(null)
  const [timeline, setTimeline] = useState<AuditTimeline | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!executionId) return
    setLoading(true); setError('')
    setApproval(undefined); setNegotiation(undefined); setStrategy(null); setTimeline(null)
    Promise.all([
      fetchPendingApproval(executionId).catch(() => null),
      fetchPendingNegotiation(executionId).catch(() => null),
      fetchStrategyNegotiation(actorId, executionId).catch(() => null),
      fetchAuditTimeline(actorId, executionId).catch((err) => { setError(err instanceof Error ? err.message : String(err)); return null }),
    ]).then(([a, n, s, t]) => { setApproval(a); setNegotiation(n); setStrategy(s); setTimeline(t) })
      .finally(() => setLoading(false))
  }, [actorId, executionId])

  const decisions = timeline?.events.filter((e) => e.kind === 'decision') ?? []
  const gateDecisions = decisions.filter((e) => e.selected_strategy === TRANSITION_GATE_STRATEGY)
  const otherDecisions = decisions.filter((e) => e.selected_strategy !== TRANSITION_GATE_STRATEGY)

  return <div className="lwe-sec-tab">
    <p className="lwe-sec-tab-desc">Pick a real execution this actor ran; every section below is a direct read scoped to that execution_id. A pending Consent or Negotiation is never shown as committed — its status comes straight from the backend's own <code>decided</code> field.</p>
    <select className="lwe-sec-actor-select" value={executionId} onChange={(e) => setExecutionId(e.target.value)} aria-label="Select execution">
      <option value="">Select an execution…</option>
      {executions.map((ex) => {
        const execId = String((ex.metadata as Record<string, unknown> | undefined)?.execution_id ?? '')
        if (!execId) return null
        return <option key={execId} value={execId}>{ex.goal} — {ex.outcome} ({fmtTime(ex.start_time)})</option>
      })}
    </select>
    {executions.length === 0 && <div className="lwe-sec-muted">This actor has no execution history yet.</div>}
    {error && <div className="lwe-sec-error">⚠ {error}</div>}
    {loading && <div className="lwe-sec-muted">Loading trace…</div>}

    {executionId && !loading && <>
      <div className="lwe-sec-trace-flow">
        <span>Intent</span>→<span>Authorization</span>→<span>Policy</span>→<span>Consent</span>→<span>Negotiation</span>→<span>TransitionGate</span>→<span>Capability</span>→<span>Commit</span>→<span>Audit</span>
      </div>

      <div className="lwe-sec-card">
        <p className="lwe-sec-subhead">Consent (human approval)</p>
        {approval === undefined ? <span className="lwe-sec-muted">…</span>
          : approval === null ? <span className="lwe-sec-muted">No human approval was required for this execution.</span>
          : (() => { const d = decidedTone(approval.decided); return <div className="lwe-sec-grid">
            <Field label="Status" value={<Pill tone={d.tone}>{d.label}</Pill>} />
            <Field label="Capability" value={approval.capability} />
            <Field label="Reason" value={approval.reason || '—'} />
            <Field label="Requested" value={fmtTime(approval.created_at)} />
            <Field label="Decided" value={fmtTime(approval.decided_at)} />
          </div> })()}
      </div>

      <div className="lwe-sec-card">
        <p className="lwe-sec-subhead">TransitionGate negotiation (counterparty)</p>
        {negotiation === undefined ? <span className="lwe-sec-muted">…</span>
          : negotiation === null ? <span className="lwe-sec-muted">No counterparty negotiation was required for this execution.</span>
          : (() => { const d = decidedTone(negotiation.decided); return <div className="lwe-sec-grid">
            <Field label="Status" value={<Pill tone={d.tone}>{d.label}</Pill>} />
            <Field label="Capability" value={negotiation.capability} />
            <Field label="Counterparties" value={negotiation.counterparties.join(', ') || '—'} />
            <Field label="Reason" value={negotiation.reason || '—'} />
            <Field label="Requested" value={fmtTime(negotiation.created_at)} />
            <Field label="Decided" value={fmtTime(negotiation.decided_at)} />
          </div> })()}
      </div>

      <div className="lwe-sec-card">
        <p className="lwe-sec-subhead">Strategy negotiation (game-theoretic — distinct from TransitionGate above)</p>
        {!strategy ? <span className="lwe-sec-muted">…</span>
          : !strategy.negotiation_required ? <span className="lwe-sec-muted">{strategy.reason || 'Not required for this execution.'}</span>
          : <div className="lwe-sec-grid">
            <Field label="Chosen strategy" value={strategy.chosen_strategy || '—'} />
            <Field label="Competitive / cooperative" value={`${strategy.is_competitive ? 'competitive' : ''}${strategy.is_competitive && strategy.is_cooperative ? ' / ' : ''}${strategy.is_cooperative ? 'cooperative' : ''}` || '—'} />
            <Field label="Agreement recorded" value={<Pill tone={strategy.agreement_recorded ? 'ok' : 'neutral'}>{strategy.agreement_recorded ? 'YES' : 'NO'}</Pill>} />
            <Field label="Colleagues involved" value={strategy.colleagues_involved?.join(', ') || '—'} />
          </div>}
      </div>

      <div className="lwe-sec-card">
        <p className="lwe-sec-subhead">TransitionGate decisions ({gateDecisions.length})</p>
        {gateDecisions.length === 0 && <span className="lwe-sec-muted">None recorded for this execution.</span>}
        {gateDecisions.map((e, i) => <div className="lwe-sec-decision-row" key={i}>
          <span className="lwe-sec-decision-time">{fmtTime(e.start_time)}</span>
          <span>{e.reason}</span>
          <code className="lwe-sec-decision-outcome">{String((e.metadata as Record<string, unknown> | undefined)?.security_outcome ?? '')}</code>
        </div>)}
      </div>

      <div className="lwe-sec-card">
        <p className="lwe-sec-subhead">Other policy decisions ({otherDecisions.length})</p>
        {otherDecisions.length === 0 && <span className="lwe-sec-muted">None recorded for this execution.</span>}
        {otherDecisions.map((e, i) => <div className="lwe-sec-decision-row" key={i}>
          <span className="lwe-sec-decision-time">{fmtTime(e.start_time)}</span>
          <code>{e.selected_strategy}</code>
          <span>{e.reason}</span>
        </div>)}
      </div>

      <div className="lwe-sec-card">
        <p className="lwe-sec-subhead">Full audit timeline ({timeline?.event_count ?? 0} events)</p>
        {(timeline?.events.length ?? 0) === 0 && <span className="lwe-sec-muted">No durable audit entries for this execution.</span>}
        {timeline?.events.map((e, i) => <div className="lwe-sec-decision-row" key={i}>
          <span className="lwe-sec-decision-time">{fmtTime(e.start_time)}</span>
          <Pill tone="neutral">{e.kind.toUpperCase()}</Pill>
          <span>{e.selected_strategy || e.status || e.goal || '—'}</span>
        </div>)}
      </div>
    </>}
  </div>
}

// ── 5. Violations — real, persisted denial records (violation_store.py,
// Redis-backed). Global (not actor-scoped): a violation is recorded
// against whatever `subject` string the JWT/header carried at the time
// of denial, which may not match the currently-selected actor. ────────
function ViolationsTab({ actorId }: { actorId: string }) {
  const [violations, setViolations] = useState<SecurityViolation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scope, setScope] = useState<'all' | 'actor'>('all')

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetchSecurityViolations(100, scope === 'actor' ? actorId : undefined)
      .then((r) => setViolations(r.violations))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [scope, actorId])

  useEffect(() => { load() }, [load])

  const patternCount = violations.filter((v) => v.pattern_detected).length

  return <div className="lwe-sec-tab">
    <div className="lwe-sec-scope-toggle">
      <button type="button" className={scope === 'all' ? 'selected' : ''} onClick={() => setScope('all')}>All subjects</button>
      <button type="button" className={scope === 'actor' ? 'selected' : ''} onClick={() => setScope('actor')}>This actor only</button>
      <button type="button" onClick={load}>Refresh</button>
    </div>
    <p className="lwe-sec-subhead">Persisted denial records ({violations.length}{patternCount > 0 ? `, ${patternCount} flagged as a burst pattern` : ''})</p>
    {error && <div className="lwe-sec-unavailable"><p className="lwe-sec-unavailable-title">ERROR</p><p>{error} — Redis may be unavailable; the store degrades to empty rather than raising.</p></div>}
    {!error && loading && <span className="lwe-sec-muted">Loading…</span>}
    {!error && !loading && violations.length === 0 && <span className="lwe-sec-muted">No denials recorded{scope === 'actor' ? ' for this actor' : ''}.</span>}
    {!error && violations.map((v) => <div className="lwe-sec-decision-row" key={v.id}>
      <span className="lwe-sec-decision-time">{fmtTime(v.recorded_at)}</span>
      <Pill tone={v.pattern_detected ? 'bad' : 'warn'}>{v.pattern_detected ? 'PATTERN' : v.outcome.toUpperCase()}</Pill>
      <span>{v.subject || 'anonymous'} — {v.permission} denied ({v.reason})</span>
    </div>)}
    <p className="lwe-sec-subhead" style={{ marginTop: 10 }}>What this is not</p>
    <span className="lwe-sec-muted">This records every denied authorization attempt through <code>require_permission</code>/<code>require_self_or_permission</code> — it is not a general intrusion-detection system, and a subject that never calls an authenticated endpoint produces no signal here at all.</span>
  </div>
}

export function SecurityPanel() {
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const [actors, setActors] = useState<Actor[]>([])
  const [actorId, setActorId] = useState<string | null>(selectedActorId)
  const [tab, setTab] = useState<Tab>('identity')
  const [cognitiveState, setCognitiveState] = useState<ActorCognitiveState | null>(null)
  const [delegations, setDelegations] = useState<Delegation[]>([])
  const [delegationsLoading, setDelegationsLoading] = useState(false)
  const [delegationsError, setDelegationsError] = useState('')

  useEffect(() => { fetchAllActors().then(setActors).catch(() => setActors([])) }, [])
  useEffect(() => { if (selectedActorId) setActorId(selectedActorId) }, [selectedActorId])

  useEffect(() => {
    if (!actorId) return
    setCognitiveState(null)
    fetchActorCognitiveState(actorId).catch(() => null).then((s) => setCognitiveState(s ?? null))
  }, [actorId])

  const loadDelegations = useCallback(async (id: string) => {
    setDelegationsLoading(true); setDelegationsError('')
    try {
      const memberships = await fetchActorMemberships(id)
      const lists = await Promise.all(
        memberships.filter((m) => m.membership_id).map((m) => fetchMembershipDelegations(m.membership_id as string).catch(() => [])),
      )
      setDelegations(lists.flat())
    } catch (err) {
      setDelegationsError(err instanceof Error ? err.message : String(err))
    } finally {
      setDelegationsLoading(false)
    }
  }, [])

  useEffect(() => { if (actorId) loadDelegations(actorId) }, [actorId, loadDelegations])

  const onRevoke = useCallback(async (delegationId: string) => {
    await revokeDelegation(delegationId)
    if (actorId) await loadDelegations(actorId)
  }, [actorId, loadDelegations])

  return <div className="lwe-sec-page">
    <div className="lwe-sec-heading">
      <h2>Security</h2>
      <p>Administrative visibility into this actor's real identity, authorization, delegation, consent, negotiation, policy, and audit state. The backend is authoritative for every decision shown here — nothing on this page computes one.</p>
    </div>

    <ArchitectureVerificationPanel title="Security architecture — manual verification (2026-08-24)" rows={SECURITY_VERIFICATION} />

    <div className="lwe-sec-toolbar">
      <ActorPicker actors={actors} actorId={actorId} onSelect={setActorId} />
    </div>

    {!actorId && <div className="lwe-sec-muted" style={{ padding: 20 }}>Select an actor to view their security state.</div>}

    {actorId && <>
      <nav className="lwe-sec-tabs">
        {TABS.map((t) => <button key={t.id} type="button" className={tab === t.id ? 'selected' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </nav>
      {tab === 'identity' && <IdentityTab actorId={actorId} cognitiveState={cognitiveState} />}
      {tab === 'authorization' && <AuthorizationTab actorId={actorId} delegations={delegations} />}
      {tab === 'delegations' && <DelegationsTab actorId={actorId} delegations={delegations} loading={delegationsLoading} error={delegationsError} onRevoke={onRevoke} />}
      {tab === 'trace' && <ExecutionTraceTab actorId={actorId} cognitiveState={cognitiveState} />}
      {tab === 'violations' && <ViolationsTab actorId={actorId} />}
    </>}
  </div>
}
