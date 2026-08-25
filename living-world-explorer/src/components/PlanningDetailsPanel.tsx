import { useEffect, useState } from 'react'
import { PanelContainer } from './PanelContainer'
import { useWorldStore } from '../store/worldStore'
import { useRefreshStore } from '../store/refreshStore'
import { fetchActorCognitiveState, type ActorCognitiveState } from '../api/cognitiveClient'
import { ActorSection, ActorTable } from './inspectorPrimitives'

export function PlanningDetailsPanel() {
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)
  const [state, setState] = useState<ActorCognitiveState | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setState(null); setError('')
    if (!selectedActorId) return
    let cancelled = false
    fetchActorCognitiveState(selectedActorId).then((result) => { if (!cancelled) setState(result) }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err))
    })
    return () => { cancelled = true }
  }, [selectedActorId, refreshSeq])

  const decision = state?.decision
  const plan = state?.current_plan
  const planDecision = state?.plan_decision
  return <PanelContainer title="Planning Details"><div className="lwe-inspector">
    <div className="lwe-inspector-tier">Domain plan and strategy decisions</div>
    {error && <div className="lwe-inspector-error">{error}</div>}
    {!selectedActorId && <div className="lwe-inspector-muted">Select an actor to see planning details.</div>}
    {selectedActorId && !state && !error && <div className="lwe-inspector-muted">Loading planning details…</div>}
    {state && <>
      <ActorSection title="Domain Plan"><dl className="lwe-inspector-fields">
        <dt>Goal</dt><dd>{plan?.goal || 'Not available'}</dd><dt>Status</dt><dd>{plan?.status || 'Not available'}</dd>
        <dt>Progress</dt><dd>{plan ? `${plan.completed_nodes} / ${plan.node_count} completed` : 'Not available'}</dd>
        <dt>Steps</dt><dd>{plan?.step_descriptions?.join(' → ') || plan?.steps?.join(' → ') || 'No steps'}</dd>
        <dt>Confidence</dt><dd>{plan?.confidence?.toFixed(2) ?? 'Not available'}</dd><dt>Risk</dt><dd>{plan?.risk?.toFixed(2) ?? 'Not available'}</dd>
        {plan?.score !== undefined && <><dt>Hysteresis Score</dt><dd>{plan.score.toFixed(3)}</dd><dt>Age</dt><dd>{plan.age_seconds !== undefined ? `${Math.round(plan.age_seconds)}s ago` : 'Not available'}</dd><dt>Kept For</dt><dd>{plan.kept_count ?? 0} tick(s)</dd></>}
      </dl><div className="lwe-inspector-hint">What the actor intends to accomplish; runtime capabilities are shown in the Execution Graph.</div></ActorSection>
      <ActorSection title="Decision"><dl className="lwe-inspector-fields"><dt>Selected Strategy</dt><dd>{decision?.selected_strategy || 'Not available'}</dd><dt>Reason</dt><dd>{decision?.reason || 'Not available'}</dd><dt>Utility</dt><dd>{decision?.utility?.toFixed(2) ?? 'Not available'}</dd><dt>Confidence</dt><dd>{decision?.confidence?.toFixed(2) ?? 'Not available'}</dd></dl></ActorSection>
      <ActorSection title="Candidate Futures"><ActorTable columns={['Name', 'Utility']} rows={(decision?.candidates ?? []).map((candidate) => ({ Name: candidate.name || 'Not available', Utility: candidate.utility?.toFixed?.(2) ?? 'Not available' }))} /></ActorSection>
      <ActorSection title="Plan Decision" className="lwe-plan-decision-section">{planDecision ? <><dl className="lwe-inspector-fields"><dt>Decision</dt><dd>{planDecision.selected_strategy || 'Not available'}</dd><dt>Reason</dt><dd>{planDecision.reason || 'Not available'}</dd></dl><ActorTable columns={['Name', 'Score']} rows={(planDecision.candidates ?? []).map((candidate) => ({ Name: candidate.name || 'Not available', Score: typeof candidate.score === 'number' ? candidate.score.toFixed(3) : candidate.utility?.toFixed?.(3) ?? 'Not available' }))} /></> : <div className="lwe-inspector-muted">No plan-hysteresis decision recorded yet.</div>}</ActorSection>
    </>}
  </div></PanelContainer>
}
