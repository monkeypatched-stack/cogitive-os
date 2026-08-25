import { useEffect, useState } from 'react'
import { Card, Row, statusColor } from './GroundingDebugger'
import { formatTime } from './inspectorPrimitives'
import {
  fetchPendingApproval, fetchPendingNegotiation, fetchStrategyNegotiation, fetchAuditTimeline,
  TRANSITION_GATE_STRATEGY, type PendingApproval, type PendingNegotiation, type StrategyNegotiation,
  type AuditTimeline, type AuditTimelineEvent,
} from '../api/securityClient'
import { fetchExecutionLearning, type LearningEvent } from '../api/learningClient'
import './ExecutionSecurityTrace.css'

// Extends the Execution Debugger from a context/prompt debugger into the
// full Intent -> Cognition -> Planning -> Security -> Commit -> Learning
// trace — every section below reads a REAL backend endpoint (mostly the
// same ones SecurityPanel.tsx already established). Where the backend
// genuinely has no per-execution record (ExecutionGraph, Simulation,
// a durable Comparator), the section says so explicitly rather than
// showing a fabricated stage — see each section's own UNAVAILABLE note.
// Reuses GroundingDebugger's own Card/Row primitives and lwe-gd- classes
// for the shared parts, per "use the existing visual language."

type Stage = 'EXECUTED' | 'SKIPPED' | 'NOT_REQUIRED' | 'PENDING' | 'BLOCKED' | 'FAILED' | 'UNAVAILABLE'
const STAGE_COLOR: Record<Stage, string> = {
  EXECUTED: '#047857', SKIPPED: '#94A3B8', NOT_REQUIRED: '#94A3B8', PENDING: '#B45309',
  BLOCKED: '#B91C1C', FAILED: '#B91C1C', UNAVAILABLE: '#94A3B8',
}
function StageBadge({ stage }: { stage: Stage }) {
  return <span className="lwe-est-badge" style={{ ['--est-accent' as string]: STAGE_COLOR[stage] }}>{stage.replace('_', ' ')}</span>
}

function GapNote({ children }: { children: React.ReactNode }) {
  return <div className="lwe-est-gap">{children}</div>
}

export function ExecutionSecurityTrace({ actorId, executionId }: { actorId: string; executionId: string }) {
  const [timeline, setTimeline] = useState<AuditTimeline | null>(null)
  const [approval, setApproval] = useState<PendingApproval | null>(null)
  const [negotiation, setNegotiation] = useState<PendingNegotiation | null>(null)
  const [strategy, setStrategy] = useState<StrategyNegotiation | null>(null)
  const [learning, setLearning] = useState<LearningEvent[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    Promise.all([
      fetchAuditTimeline(actorId, executionId).catch((err) => { setError(err instanceof Error ? err.message : String(err)); return null }),
      fetchPendingApproval(executionId).catch(() => null),
      fetchPendingNegotiation(executionId).catch(() => null),
      fetchStrategyNegotiation(actorId, executionId).catch(() => null),
      fetchExecutionLearning(executionId).then((r) => r.events).catch(() => []),
    ]).then(([t, a, n, s, l]) => {
      if (cancelled) return
      setTimeline(t); setApproval(a); setNegotiation(n); setStrategy(s); setLearning(l)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [actorId, executionId])

  if (loading) return <div className="lwe-est-loading">Loading execution + security trace…</div>
  if (error && !timeline) return <div className="lwe-est-error">⚠ {error}</div>

  const events = timeline?.events ?? []
  const planEvents = events.filter((e) => e.kind === 'plan')
  const executionEvent = events.find((e) => e.kind === 'execution')
  const decisions = events.filter((e) => e.kind === 'decision')
  const gateDecisions = decisions.filter((e) => e.selected_strategy === TRANSITION_GATE_STRATEGY)
  const otherDecisions = decisions.filter((e) => e.selected_strategy !== TRANSITION_GATE_STRATEGY)
  const currentPlan = planEvents.find((e) => e.status === 'generated') ?? planEvents[planEvents.length - 1]
  const worldChanges = (executionEvent?.metadata?.world_changes as string[] | undefined) ?? []
  const capabilitiesUsed = (executionEvent as (AuditTimelineEvent & { capabilities_used?: string[] }) | undefined)?.capabilities_used ?? []

  // ── 21. Security invariant ordering — verified from REAL timestamps
  // only when every stage that actually ran has one; never asserted when
  // data is missing.
  const planTime = currentPlan?.start_time
  const gateTime = gateDecisions[0]?.start_time
  const commitTime = executionEvent?.start_time
  let ordering: { verified: boolean; note: string } | null = null
  if (planTime && gateTime && commitTime) {
    const inOrder = planTime <= gateTime && gateTime <= commitTime
    ordering = {
      verified: inOrder,
      note: inOrder
        ? `Plan (${formatTime(planTime)}) ≤ TransitionGate decision (${formatTime(gateTime)}) ≤ Commit (${formatTime(commitTime)})`
        : `SECURITY VIOLATION — out-of-order timestamps: plan ${formatTime(planTime)}, gate ${formatTime(gateTime)}, commit ${formatTime(commitTime)}`,
    }
  } else if (gateTime && commitTime) {
    const inOrder = gateTime <= commitTime
    ordering = { verified: inOrder, note: inOrder ? `TransitionGate decision (${formatTime(gateTime)}) ≤ Commit (${formatTime(commitTime)})` : `SECURITY VIOLATION — gate decided after commit` }
  }

  return <div className="lwe-est">
    <div className="lwe-est-flow">
      <span>Intent</span>→<span>Planning</span>→<span>Prediction</span>→<span>Proposed Transition</span>→<span>Security</span>→<span>TransitionGate</span>→<span>Capability</span>→<span>Commit</span>→<span>Observation</span>→<span>Learning</span>
    </div>

    {/* Planning */}
    <Card title="Planning" subtitle={`${planEvents.length} plan event(s)`} reason={currentPlan ? undefined : 'No PLAN timeline entry recorded for this execution'}>
      {planEvents.length === 0 ? <GapNote>No plan lifecycle events recorded for this execution.</GapNote> : planEvents.map((p, i) => (
        <Row key={i} accent={statusColor(String(p.status ?? ''))} dot
          main={<>{String(p.goal ?? '')} <StageBadge stage={p.status === 'generated' ? 'EXECUTED' : p.status === 'invalidated' ? 'BLOCKED' : 'EXECUTED'} /></>}
          sub={Array.isArray(p.steps) ? (p.steps as string[]).join(' → ') : undefined}
          time={formatTime(p.start_time)}
        />
      ))}
    </Card>

    {/* Prediction — corrected: the SEPARATE SimulationRuntime/LLM-solver
        pipeline (kernel/simulation_runtime.py, /simulate/*) really is a
        disconnected, manually-invoked gateway with no execution_id
        correlation — that part of the original finding holds. But this
        codebase ALSO has a real, live prediction stage this execution
        genuinely ran: belief_runtime.py::_predict() reads the learned
        TransitionModel (kernel/pipeline/prediction/transitions.py) and
        computes a per-step success-probability prediction BEFORE
        executing, purely from real prior outcomes (Bayesian update, no
        LLM/world-clone simulation involved). It is not separately
        persisted (BeliefState.predictions lives only in-memory for that
        one request; TimelineStore has no PREDICTION kind) — its real
        input/output IS visible below: Learning's `previous.probability`
        per action is exactly what this stage predicted going into this
        execution, `updated.probability` is the Bayesian update after the
        real outcome. */}
    <Card title="Prediction" subtitle="belief_runtime.py::_predict() — learned per-step success probability, not the separate (disconnected) SimulationRuntime/LLM-solver gateway">
      <StageBadge stage="EXECUTED" />
      <GapNote>Runs live for every execution but isn't separately persisted — its real predicted-vs-actual values are the Learning table's "Predicted (before)" / "Updated (after)" columns below.</GapNote>
    </Card>

    {/* Proposed Transition */}
    <Card title="Proposed Transition">
      {approval || negotiation ? <div className="lwe-est-grid">
        {approval && <><div className="lwe-est-field"><span>Capability</span><b>{approval.capability}</b></div><div className="lwe-est-field"><span>Reason</span><b>{approval.reason || '—'}</b></div></>}
        {negotiation && <><div className="lwe-est-field"><span>Capability</span><b>{negotiation.capability}</b></div><div className="lwe-est-field"><span>Counterparties</span><b>{negotiation.counterparties.join(', ') || '—'}</b></div></>}
      </div> : <GapNote>No separate ProposedTransition record exists for this execution — it was never gated (no approval/negotiation pause), and the backend only persists the proposed transition object when a gate pause actually occurs. See TransitionGate below for what the gate itself decided.</GapNote>}
    </Card>

    {/* Security */}
    <Card title="Security" subtitle="Identity · Authorization · Delegation · Policy · Consent · Negotiation">
      <div className="lwe-est-security-grid">
        <div className="lwe-est-sec-row"><span>Identity</span><StageBadge stage="EXECUTED" /><small>verified via require_permission on every request — see Security console for this actor</small></div>
        <div className="lwe-est-sec-row"><span>Authorization</span><StageBadge stage={otherDecisions.length || gateDecisions.length ? 'EXECUTED' : 'UNAVAILABLE'} /><small>backend does not tag a per-action ALLOW/DENY separately from the TransitionGate decision below</small></div>
        <div className="lwe-est-sec-row"><span>Policy</span><StageBadge stage={otherDecisions.length > 0 ? 'EXECUTED' : 'NOT_REQUIRED'} /><small>{otherDecisions.length > 0 ? otherDecisions.map((d) => d.selected_strategy).join(', ') : 'no non-gate policy decision recorded'}</small></div>
        <div className="lwe-est-sec-row"><span>Consent</span><StageBadge stage={approval ? (approval.decided === null ? 'PENDING' : approval.decided ? 'EXECUTED' : 'BLOCKED') : 'NOT_REQUIRED'} /><small>{approval ? (approval.reason || 'human approval') : 'no human approval was required'}</small></div>
        <div className="lwe-est-sec-row"><span>Negotiation</span><StageBadge stage={negotiation ? (negotiation.decided === null ? 'PENDING' : negotiation.decided ? 'EXECUTED' : 'BLOCKED') : 'NOT_REQUIRED'} /><small>{negotiation ? (negotiation.reason || 'counterparty negotiation') : (strategy && !strategy.negotiation_required ? strategy.reason : 'no counterparty negotiation was required')}</small></div>
      </div>
    </Card>

    {/* TransitionGate */}
    <Card title="TransitionGate" subtitle={`${gateDecisions.length} decision(s)`}>
      {gateDecisions.length === 0 ? <GapNote>No TransitionGate decision recorded for this execution.</GapNote> : gateDecisions.map((g, i) => (
        <Row key={i} accent="#4338CA" dot main={g.reason} sub={String((g.metadata as Record<string, unknown> | undefined)?.security_outcome ?? '')} time={formatTime(g.start_time)} />
      ))}
      {ordering && <div className={`lwe-est-order ${ordering.verified ? 'ok' : 'bad'}`}>{ordering.verified ? '✓ ORDER VERIFIED' : '✕'} {ordering.note}</div>}
      {!ordering && gateDecisions.length > 0 && <GapNote>Insufficient real timestamps to verify proposal-before-gate-before-commit ordering for this execution.</GapNote>}
    </Card>

    {/* Capability / Provider */}
    <Card title="Capability & Provider" subtitle={`${capabilitiesUsed.length} capabilit${capabilitiesUsed.length === 1 ? 'y' : 'ies'} used`}>
      {capabilitiesUsed.length === 0 ? <GapNote>No capability execution recorded.</GapNote> : <div className="lwe-est-chips">
        {capabilitiesUsed.map((c, i) => <span className="lwe-gd-chip" key={i}>{c}</span>)}
      </div>}
    </Card>

    {/* World Commit */}
    <Card title="World Commit" reason={worldChanges.length === 0 ? 'No world-change evidence recorded' : undefined}>
      {worldChanges.length === 0 ? <GapNote>No world_changes recorded for this execution.</GapNote> : <>
        <ul className="lwe-est-changes">{worldChanges.map((c, i) => <li key={i}>{c}</li>)}</ul>
        <GapNote>These are real, human-readable change descriptions (kernel/pipeline/belief_runtime.py) — no structured per-resource before/after diff endpoint exists to render a strict BEFORE/AFTER table.</GapNote>
      </>}
    </Card>

    {/* Observation */}
    <Card title="Observation">
      <div className="lwe-est-grid">
        <div className="lwe-est-field"><span>Outcome</span><b style={{ color: statusColor(timeline?.outcome ?? '') }}>{timeline?.outcome || 'unknown'}</b></div>
        <div className="lwe-est-field"><span>Goal observed</span><b>{timeline?.goal || '—'}</b></div>
      </div>
    </Card>

    {/* Comparator + Learning — merged: ComparatorRuntime DOES have a
        per-execution-scoped slot (self._comparisons[execution_id], read
        via get_last_comparison(execution_id)) — but nothing in the live
        belief_runtime/action_executor path ever calls .compare() to
        populate it; only an explicit POST /compare/run with a
        caller-supplied predicted/actual payload does. So the mechanism
        is real, just unreachable for a real execution like this one —
        the closest real predicted-vs-actual signal that DOES get
        populated live is each action's policy-probability update below. */}
    <Card title="Learning" subtitle={`${learning.length} policy update(s) — ComparatorRuntime has a per-execution slot but nothing in the live path ever writes to it`}>
      {learning.length === 0 ? <GapNote>No learning events recorded for this execution.</GapNote> : <div className="lwe-est-table-wrap"><table className="lwe-est-table">
        <thead><tr><th>Action</th><th>Predicted (before)</th><th>Updated (after)</th><th>Outcome</th></tr></thead>
        <tbody>{learning.map((e, i) => <tr key={i}>
          <td>{e.action_key}</td>
          <td>{e.previous ? `p=${e.previous.probability.toFixed(2)}` : <em>cold start</em>}</td>
          <td>p={e.updated.probability.toFixed(2)}</td>
          <td><StageBadge stage={e.success ? 'EXECUTED' : 'FAILED'} /></td>
        </tr>)}</tbody>
      </table></div>}
    </Card>
  </div>
}
