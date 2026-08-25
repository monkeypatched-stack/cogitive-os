import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorldStore } from '../store/worldStore'
import {
  startTransaction, fetchExecutionNegotiation,
  type TransactionResponseDto, type TransactionStepResponseDto, type ExecutionNegotiation,
} from '../api/negotiationClient'
import { useTransactionEvents } from '../api/useTransactionEvents'
import { fetchActorTimeline, fetchActors, type Actor } from '../api/actorClient'
import { classify, decisionKindOf, negotiationExecutionIdOf } from '../timeline/timelineEvents'
import { ArchitectureVerificationPanel } from './ArchitectureVerificationPanel'
import { NEGOTIATION_VERIFICATION } from '../data/architectureVerification'
import './NegotiationsPanel.css'

// ─── Negotiations workspace ──────────────────────────────────────────────
// Built entirely on the real negotiation centerpiece: POST /actors/{id}/
// transactions (kernel/society/transaction.py::TransactionCoordinator +
// game_theory.py::GameTheoryRuntime) for LIVE sessions started from this
// page, and GET /actors/{id}/executions/{id}/negotiation (the real,
// already-existing Timeline-derived record) for HISTORICAL sessions. No
// "list all transactions" route exists — these are genuinely two
// different real data sources, kept visibly distinct rather than merged
// into one fake unified list.

interface HistoricalRecord { executionId: string; negotiation: ExecutionNegotiation }

type SelectedSession =
  | { kind: 'live'; transaction: TransactionResponseDto }
  | { kind: 'historical'; record: HistoricalRecord }
  | null

function outcomeClass(outcome: string | undefined): string {
  if (!outcome) return ''
  return `outcome-${outcome}`
}

function LiveSessionGraph({
  transaction, selectedStep, onSelectStep,
}: { transaction: TransactionResponseDto; selectedStep: number | null; onSelectStep: (i: number | null) => void }) {
  const nodeW = 150
  const nodeH = 56
  const gap = 40
  const totalNodes = transaction.steps.length + 1
  const width = Math.max(600, totalNodes * (nodeW + gap))
  const y = 30

  const positions: Array<{ x: number; label: string }> = [{ x: gap, label: 'Originator' }]
  transaction.steps.forEach((_, i) => positions.push({ x: gap + (i + 1) * (nodeW + gap), label: `Step ${i + 1}` }))

  return (
    <div className="lwe-neg-graph">
      <svg className="lwe-neg-svg" width={width} height={140}>
        {positions.slice(1).map((pos, i) => (
          <line key={i} className="lwe-neg-edge" x1={positions[i].x + nodeW} y1={y + nodeH / 2} x2={pos.x} y2={y + nodeH / 2} />
        ))}
        <g transform={`translate(${positions[0].x},${y})`}>
          <rect className="lwe-neg-node-card" width={nodeW} height={nodeH} rx={10} />
          <text className="lwe-neg-node-label" x={10} y={22}>Originator</text>
          <text className="lwe-neg-node-sub" x={10} y={38}>{transaction.originating_actor_id.slice(0, 18)}</text>
        </g>
        {transaction.steps.map((step, i) => {
          const pos = positions[i + 1]
          const outcome = (step.trace?.execution_outcome as string | undefined)
          return (
            <g key={i} transform={`translate(${pos.x},${y})`} onClick={() => onSelectStep(selectedStep === i ? null : i)}
              className={`lwe-neg-node-card ${outcomeClass(outcome)}${selectedStep === i ? ' is-selected' : ''}`}>
              <rect className={`lwe-neg-node-card ${outcomeClass(outcome)}${selectedStep === i ? ' is-selected' : ''}`} width={nodeW} height={nodeH} rx={10} />
              <text className="lwe-neg-node-label" x={10} y={20}>{step.next_action}</text>
              <text className="lwe-neg-node-sub" x={10} y={36}>{step.target_actor_id.slice(0, 18)}</text>
              <text className="lwe-neg-node-sub" x={10} y={49}>{outcome || 'no trace'}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function NegotiationsPanel() {
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const navigate = useNavigate()

  const [actors, setActors] = useState<Actor[]>([])
  const [objective, setObjective] = useState('')
  const [maxSteps, setMaxSteps] = useState(6)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [liveSessions, setLiveSessions] = useState<TransactionResponseDto[]>([])

  const [historical, setHistorical] = useState<HistoricalRecord[]>([])
  const [historicalLoading, setHistoricalLoading] = useState(false)
  const [historicalError, setHistoricalError] = useState('')

  const [selected, setSelected] = useState<SelectedSession>(null)
  const [selectedStep, setSelectedStep] = useState<number | null>(null)

  const actorName = useMemo(() => {
    const byId = new Map(actors.map((a) => [a.actor_id, a.name]))
    return (id: string) => byId.get(id) ?? id
  }, [actors])

  useEffect(() => { fetchActors().then(setActors).catch(() => {}) }, [])

  const loadHistorical = useCallback(() => {
    if (!selectedActorId) { setHistorical([]); return }
    setHistoricalLoading(true)
    setHistoricalError('')
    fetchActorTimeline(selectedActorId)
      .then(async (entries) => {
        const negotiationExecIds = entries
          .filter((entry) => classify(entry) === 'decision' && decisionKindOf(entry) === 'negotiation')
          .map((entry) => negotiationExecutionIdOf(entry))
          .filter((id): id is string => Boolean(id))
        const uniqueIds = [...new Set(negotiationExecIds)]
        const records = await Promise.all(uniqueIds.map(async (executionId) => {
          try {
            const negotiation = await fetchExecutionNegotiation(selectedActorId, executionId)
            return { executionId, negotiation }
          } catch {
            return null
          }
        }))
        setHistorical(records.filter((r): r is HistoricalRecord => r !== null && r.negotiation.negotiation_required))
      })
      .catch((err) => setHistoricalError(err instanceof Error ? err.message : String(err)))
      .finally(() => setHistoricalLoading(false))
  }, [selectedActorId])

  useEffect(() => { loadHistorical() }, [loadHistorical])

  const handleStart = async () => {
    if (!selectedActorId || !objective.trim() || starting) return
    setStarting(true)
    setStartError('')
    try {
      const result = await startTransaction(selectedActorId, objective.trim(), maxSteps)
      setLiveSessions((prev) => [result, ...prev])
      setSelected({ kind: 'live', transaction: result })
      setSelectedStep(null)
      setObjective('')
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  const liveTransactionId = selected?.kind === 'live' ? selected.transaction.transaction_id : null
  const { events: liveEvents, status: wsStatus } = useTransactionEvents(liveTransactionId)

  const selectedStepData: TransactionStepResponseDto | null =
    selected?.kind === 'live' && selectedStep !== null ? selected.transaction.steps[selectedStep] ?? null : null

  if (!selectedActorId) {
    return <div className="lwe-neg-page">
      <div className="lwe-inspector-muted" style={{ padding: 12 }}>
        Select an actor to start or inspect negotiations as that actor.
      </div>
    </div>
  }

  return (
    <div className="lwe-neg-page">
      <div className="lwe-neg-heading">
        <div>
          <h2>Negotiations</h2>
          <p>The real negotiation runtime — TransactionCoordinator + GameTheoryRuntime. Starting a negotiation runs a genuine multi-round LLM loop (can take 1-4 minutes), not a simulator.</p>
        </div>
      </div>

      <div className="lwe-neg-form">
        <div className="lwe-neg-form-row">
          <input className="lwe-neg-input" placeholder="Objective, e.g. Find the best price for milk among affiliates" value={objective} onChange={(e) => setObjective(e.target.value)} disabled={starting} />
          <input className="lwe-neg-input-small" type="number" min={1} max={32} value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value) || 6)} disabled={starting} title="Max steps" />
          <button type="button" className="lwe-neg-btn" disabled={!objective.trim() || starting} onClick={handleStart}>
            {starting ? 'Negotiating…' : 'Start Negotiation'}
          </button>
        </div>
        <span className="lwe-neg-note">Runs as the selected actor. This is a real call to the runtime's negotiation loop — not a preview.</span>
      </div>

      {starting && <div className="lwe-neg-progress"><div className="lwe-neg-spinner" /><span>Negotiating live — this is a real multi-round LLM loop, genuinely slow (observed 60s-240s+). Do not navigate away.</span></div>}
      {startError && <div className="lwe-neg-error">⚠ {startError}</div>}
      {historicalError && <div className="lwe-neg-error">⚠ {historicalError}</div>}

      <div className="lwe-neg-columns">
        <div className="lwe-neg-sessions">
          <div className="lwe-neg-session-group-title">Started this session <span className="lwe-neg-badge lwe-neg-badge-live">LIVE</span></div>
          {liveSessions.length === 0 && <div className="lwe-neg-empty">No negotiations started yet in this browser session.</div>}
          {liveSessions.map((t) => (
            <button key={t.transaction_id} type="button"
              className={`lwe-neg-session-card${selected?.kind === 'live' && selected.transaction.transaction_id === t.transaction_id ? ' is-selected' : ''}`}
              onClick={() => { setSelected({ kind: 'live', transaction: t }); setSelectedStep(null) }}>
              <span className="lwe-neg-session-card-title">{t.objective}</span>
              <span className="lwe-neg-session-card-sub">
                <span className={`lwe-neg-status-chip lwe-neg-status-${t.status}`}>{t.status}</span> · {t.steps.length} steps · {actorName(t.originating_actor_id)}
              </span>
            </button>
          ))}

          <div className="lwe-neg-session-group-title" style={{ marginTop: 8 }}>
            Historical (this actor) <span className="lwe-neg-badge lwe-neg-badge-historical">HISTORICAL</span>
          </div>
          {historicalLoading && <div className="lwe-neg-empty">Loading Timeline-derived negotiation records…</div>}
          {!historicalLoading && historical.length === 0 && <div className="lwe-neg-empty">No negotiation-flavored decisions in this actor's Timeline.</div>}
          {historical.map((r) => (
            <button key={r.executionId} type="button"
              className={`lwe-neg-session-card${selected?.kind === 'historical' && selected.record.executionId === r.executionId ? ' is-selected' : ''}`}
              onClick={() => setSelected({ kind: 'historical', record: r })}>
              <span className="lwe-neg-session-card-title">{r.negotiation.chosen_strategy || 'Negotiation decision'}</span>
              <span className="lwe-neg-session-card-sub">{r.negotiation.negotiation_outcome || 'outcome not recorded'} · execution {r.executionId.slice(0, 8)}</span>
            </button>
          ))}
        </div>

        <div className="lwe-neg-detail">
          {!selected && <div className="lwe-neg-empty">Select a negotiation to inspect it.</div>}

          {selected?.kind === 'live' && (
            <>
              <div className="lwe-neg-detail-head">
                <h3>{selected.transaction.objective}</h3>
                <span className={`lwe-neg-status-chip lwe-neg-status-${selected.transaction.status}`}>{selected.transaction.status}</span>
              </div>
              <dl className="lwe-inspector-fields">
                <div><dt>Transaction ID</dt><dd>{selected.transaction.transaction_id}</dd></div>
                <div><dt>Originator</dt><dd>{actorName(selected.transaction.originating_actor_id)}</dd></div>
                <div><dt>Affiliates contacted</dt><dd>{selected.transaction.affiliates_contacted.length > 0 ? selected.transaction.affiliates_contacted.map(actorName).join(', ') : 'None'}</dd></div>
                <div><dt>Final outcome</dt><dd>{selected.transaction.final_outcome || 'Not available'}</dd></div>
                <div><dt>Duration</dt><dd>{selected.transaction.duration_ms.toFixed(0)}ms</dd></div>
                <div><dt>Live stream</dt><dd>{wsStatus === 'open' ? '● connected' : wsStatus === 'closed' ? 'stream ended' : wsStatus}</dd></div>
              </dl>

              <LiveSessionGraph transaction={selected.transaction} selectedStep={selectedStep} onSelectStep={setSelectedStep} />

              {selectedStepData && (
                <div className="lwe-neg-step-inspector">
                  <dl className="lwe-inspector-fields">
                    <div><dt>Step</dt><dd>{selectedStepData.step_number}</dd></div>
                    <div><dt>Target</dt><dd>{actorName(selectedStepData.target_actor_id)}</dd></div>
                    <div><dt>Message</dt><dd>{selectedStepData.message}</dd></div>
                    <div><dt>Next action</dt><dd>{selectedStepData.next_action} — {selectedStepData.next_action_reason}</dd></div>
                    <div><dt>Strategic context</dt><dd>{selectedStepData.strategic_context ? JSON.stringify(selectedStepData.strategic_context) : 'Not available'}</dd></div>
                    <div><dt>Trace outcome</dt><dd>{selectedStepData.trace ? String(selectedStepData.trace.execution_outcome ?? 'Not available') : 'Not available — target did not respond'}</dd></div>
                    <div><dt>Trace explanation</dt><dd>{selectedStepData.trace ? String(selectedStepData.trace.explanation ?? 'Not available') : 'Not available'}</dd></div>
                  </dl>
                  <details className="lwe-neg-raw"><summary>Raw Step Data</summary><pre>{JSON.stringify(selectedStepData, null, 2)}</pre></details>
                </div>
              )}

              {liveEvents.length > 0 && (
                <div className="lwe-neg-live-stream">
                  <div className="lwe-neg-session-group-title">Live stream ({liveEvents.length} events)</div>
                  {liveEvents.map((e, i) => <div key={i} className="lwe-neg-live-stream-row">{JSON.stringify(e)}</div>)}
                </div>
              )}
            </>
          )}

          {selected?.kind === 'historical' && (
            <>
              <div className="lwe-neg-detail-head">
                <h3>{selected.record.negotiation.chosen_strategy || 'Negotiation decision'}</h3>
                <button type="button" className="lwe-neg-btn lwe-neg-btn-secondary" onClick={() => { useWorldStore.getState().selectActor(selectedActorId); navigate('/timeline') }}>
                  View in Timeline →
                </button>
              </div>
              <dl className="lwe-inspector-fields">
                <div><dt>Execution ID</dt><dd>{selected.record.executionId}</dd></div>
                <div><dt>Outcome</dt><dd>{selected.record.negotiation.negotiation_outcome || 'Not recorded'}</dd></div>
                <div><dt>Competitive / Cooperative</dt><dd>{selected.record.negotiation.is_competitive ? 'Competitive' : selected.record.negotiation.is_cooperative ? 'Cooperative' : 'Not recorded'}</dd></div>
                <div><dt>Agreement recorded</dt><dd>{selected.record.negotiation.agreement_recorded ? 'Yes' : 'No'}</dd></div>
                <div><dt>Colleagues involved</dt><dd>{(selected.record.negotiation.colleagues_involved ?? []).map(actorName).join(', ') || 'None'}</dd></div>
                <div><dt>Candidate strategies</dt><dd>{(selected.record.negotiation.candidate_strategies ?? []).join(', ') || 'Not available'}</dd></div>
              </dl>
              {selected.record.negotiation.utility_evaluation && selected.record.negotiation.utility_evaluation.length > 0 && (
                <>
                  <div className="lwe-neg-session-group-title">Utility evaluation</div>
                  <ul className="lwe-inspector-list">
                    {selected.record.negotiation.utility_evaluation.map((u, i) => <li key={i}>{u.name ?? 'Option'}: {u.utility?.toFixed?.(3) ?? 'n/a'}</li>)}
                  </ul>
                </>
              )}
              <details className="lwe-neg-raw"><summary>Raw Data</summary><pre>{JSON.stringify(selected.record, null, 2)}</pre></details>
            </>
          )}
        </div>
      </div>

      <ArchitectureVerificationPanel title="Architecture Verification — Negotiation" rows={NEGOTIATION_VERIFICATION} />
    </div>
  )
}
