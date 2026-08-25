import { useEffect, useState } from 'react'
import { PanelContainer } from './PanelContainer'
import { useWorldStore } from '../store/worldStore'
import { useRefreshStore } from '../store/refreshStore'
import { fetchActorCognitiveState, type ActorCognitiveState } from '../api/cognitiveClient'
import { fetchExecutionScenarios, type ExecutionScenarios } from '../api/narrativeClient'
import { ActorTable, formatTime } from './inspectorPrimitives'
import './InspectorPanel.css'

/** Execution history is a log surface, scoped to the currently selected
 * actor. It uses the same persisted cognitive-state records as Inspector.
 * Clicking a row (that carries a real execution_id) additionally loads
 * that execution's real Predict-stage scenario participation — which
 * scenario sources (Baseline + every registered counterfactual
 * assumption) actually ran, not just the winning candidate. */
export function ExecutionHistoryPanel() {
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)
  const [state, setState] = useState<ActorCognitiveState | null>(null)
  const [error, setError] = useState('')

  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<ExecutionScenarios | null>(null)
  const [scenariosError, setScenariosError] = useState('')
  const [scenariosLoading, setScenariosLoading] = useState(false)

  useEffect(() => {
    setState(null)
    setError('')
    setSelectedExecutionId(null)
    if (!selectedActorId) return
    let cancelled = false
    fetchActorCognitiveState(selectedActorId).then((result) => {
      if (!cancelled) setState(result)
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err))
    })
    return () => { cancelled = true }
  }, [selectedActorId, refreshSeq])

  useEffect(() => {
    if (!selectedActorId || !selectedExecutionId) {
      setScenarios(null)
      setScenariosError('')
      return
    }
    let cancelled = false
    setScenariosLoading(true)
    fetchExecutionScenarios(selectedActorId, selectedExecutionId)
      .then((result) => { if (!cancelled) { setScenarios(result); setScenariosError('') } })
      .catch((err) => { if (!cancelled) setScenariosError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setScenariosLoading(false) })
    return () => { cancelled = true }
  }, [selectedActorId, selectedExecutionId])

  return <PanelContainer title="Execution History"><div className="lwe-inspector">
    <div className="lwe-inspector-tier">Persisted execution log</div>
    {error && <div className="lwe-inspector-error">{error}</div>}
    {!selectedActorId && <div className="lwe-inspector-muted">Select an actor to see execution history.</div>}
    {selectedActorId && !state && !error && <div className="lwe-inspector-muted">Loading execution history…</div>}
    {state && <ActorTable
      columns={['Time', 'Outcome', 'Goal', 'World Changes', 'Reward', 'Loss', 'Duration (ms)']}
      rows={state.execution_history.map((entry) => ({
        Time: formatTime(entry.start_time), Outcome: entry.outcome, Goal: entry.goal || 'Not available',
        'World Changes': Array.isArray(entry.metadata.world_changes) && entry.metadata.world_changes.length > 0 ? entry.metadata.world_changes.join('; ') : 'None recorded.',
        Reward: entry.reward?.toFixed(2) ?? 'Not available', Loss: entry.actor_loss?.toFixed(2) ?? 'Not available',
        'Duration (ms)': typeof entry.metadata.duration_ms === 'number' ? entry.metadata.duration_ms.toFixed(1) : 'Not available',
        _execution_id: typeof entry.metadata.execution_id === 'string' ? entry.metadata.execution_id : '',
      }))}
      onRowClick={(row) => {
        const id = row._execution_id as string
        if (!id) return
        setSelectedExecutionId((current) => (current === id ? null : id))
      }}
      selectedIndex={state.execution_history.findIndex((e) => e.metadata.execution_id === selectedExecutionId)}
    />}
    {state && state.execution_history.length === 0 && <div className="lwe-inspector-muted">No executions recorded for this actor.</div>}

    {selectedExecutionId && (
      <div className="lwe-inspector-section">
        <div className="lwe-inspector-section-title">Scenario Participation — execution {selectedExecutionId.slice(0, 8)}</div>
        {scenariosLoading && <div className="lwe-inspector-muted">Loading scenario participation…</div>}
        {scenariosError && <div className="lwe-inspector-error">{scenariosError}</div>}
        {!scenariosLoading && !scenariosError && (!scenarios || !scenarios.prediction_available) && (
          <div className="lwe-inspector-muted">{scenarios?.reason || 'No prediction recorded for this execution.'}</div>
        )}
        {scenarios?.prediction_available && <>
          <dl className="lwe-inspector-fields">
            <dt>Recommendation</dt><dd>{scenarios.recommendation || 'Not available'}</dd>
            <dt>Reason</dt><dd>{scenarios.reason || 'Not available'}</dd>
            <dt>Confidence</dt><dd>{typeof scenarios.confidence === 'number' ? scenarios.confidence.toFixed(2) : 'Not available'}</dd>
            <dt>Aggregation</dt><dd>{scenarios.scenario_participation?.aggregation_status ?? 'Not available'}</dd>
            <dt>Prediction ID</dt><dd>{scenarios.prediction_id || 'Not available'}</dd>
          </dl>
          {scenarios.scenario_participation && (
            <div className="lwe-inspector-table-wrap" style={{ marginTop: 8 }}>
              <table className="lwe-inspector-table">
                <thead><tr><th>Scenario</th><th>Status</th><th>Detail</th></tr></thead>
                <tbody>
                  {scenarios.scenario_participation.scenarios_required.map((label) => {
                    const participation = scenarios.scenario_participation!
                    const failure = participation.scenarios_failed.find((f) => f.label === label)
                    const succeeded = participation.scenarios_succeeded.includes(label)
                    const invoked = participation.scenarios_invoked.includes(label)
                    const kind = succeeded ? 'ok' : failure || invoked ? 'fail' : 'skip'
                    const symbol = succeeded ? '✓' : failure || invoked ? '✗' : '—'
                    const statusText = succeeded ? 'Succeeded' : failure || invoked ? 'Failed' : 'Not invoked'
                    return (
                      <tr key={label}>
                        <td>{label}</td>
                        <td><span className={`lwe-inspector-chip lwe-inspector-chip-${kind}`}>{symbol} {statusText}</span></td>
                        <td>{failure?.error || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {(scenarios.candidates?.length ?? 0) > 0 && (
            <ActorTable columns={['Name', 'Probability', 'Utility']} rows={(scenarios.candidates ?? []).map((c) => ({
              Name: c.name || 'Not available',
              Probability: typeof c.probability === 'number' ? c.probability.toFixed(3) : 'Not available',
              Utility: typeof c.utility === 'number' ? c.utility.toFixed(2) : 'Not available',
            }))} />
          )}
        </>}
      </div>
    )}
  </div></PanelContainer>
}
