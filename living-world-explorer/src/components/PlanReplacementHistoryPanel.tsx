import { useEffect, useState } from 'react'
import { PanelContainer } from './PanelContainer'
import { useWorldStore } from '../store/worldStore'
import { useRefreshStore } from '../store/refreshStore'
import { fetchActorCognitiveState, type ActorCognitiveState } from '../api/cognitiveClient'
import { ActorTable, formatTime } from './inspectorPrimitives'

export function PlanReplacementHistoryPanel() {
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

  const history = (state?.decision_history ?? []).filter((decision) => decision.metadata?.decision_kind === 'plan_hysteresis')
  return <PanelContainer title="Plan Replacement History"><div className="lwe-inspector">
    <div className="lwe-inspector-tier">Plan hysteresis decisions</div>
    {error && <div className="lwe-inspector-error">{error}</div>}
    {!selectedActorId && <div className="lwe-inspector-muted">Select an actor to see plan replacements.</div>}
    {selectedActorId && !state && !error && <div className="lwe-inspector-muted">Loading plan replacement history…</div>}
    {state && <ActorTable columns={['Time', 'Action', 'Reason', 'New Score', 'Current Score']} rows={history.map((decision) => {
      const current = decision.candidates?.find((candidate) => candidate.name === 'current_plan')
      const next = decision.candidates?.find((candidate) => candidate.name === 'new_plan')
      return {
        Time: formatTime(decision.start_time), Action: decision.selected_strategy || 'Not available', Reason: decision.reason || 'Not available',
        'New Score': typeof next?.score === 'number' ? next.score.toFixed(3) : 'Not available',
        'Current Score': typeof current?.utility === 'number' ? current.utility.toFixed(3) : 'Not available',
      }
    })} />}
    {state && history.length === 0 && <div className="lwe-inspector-muted">No plan replacements recorded.</div>}
  </div></PanelContainer>
}
