import { useEffect, useMemo, useState } from 'react'
import { PanelContainer } from './PanelContainer'
import { fetchActorCognitiveState, type PlanRecord } from '../api/cognitiveClient'
import { useWorldStore } from '../store/worldStore'
import { useRefreshStore } from '../store/refreshStore'
import './ExecutionGraphPanel.css'

type NodeState = 'pending' | 'running' | 'completed' | 'failed'

// Only completed_nodes (a real count — exec_result.success_count at the
// time this PlanRecord was written, kernel/compile/cognitive_actor.py)
// and status (completed/failed) are actually persisted per plan — no
// per-step outcome exists, so this is deliberately the coarsest honest
// reading of that data: the first completed_nodes steps are shown
// completed, and (only when the plan overall failed) the next one is
// shown failed — not a claim about exactly which step broke.
function stepState(index: number, plan: PlanRecord, currentIndex: number): NodeState {
  if (index < plan.completed_nodes) return index <= currentIndex ? 'completed' : 'pending'
  if (index === plan.completed_nodes && plan.status === 'failed') return 'failed'
  if (index === currentIndex) return 'running'
  return 'pending'
}

/**
 * Real per-actor execution DAG: the currently selected actor's most
 * recent Plan (kernel/timeline/entry.py::PlanRecord, persisted by the
 * Cognitive State sprint) rendered as a linear step chain — not the
 * unrelated /state/mesh service (kept dead/unavailable; this panel no
 * longer depends on it). Refetches on refreshSeq (a real Planetary Tick
 * or a chat-triggered /prompt for this actor) exactly like every other
 * panel showing this actor's state.
 */
export function ExecutionGraphPanel() {
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const actorsById = useWorldStore((s) => s.actorsById)
  const [plan, setPlan] = useState<PlanRecord | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)

  useEffect(() => {
    setPlan(null)
    setCurrentIndex(0)
    setError('')
    if (!selectedActorId) return
    let cancelled = false
    setLoading(true)
    fetchActorCognitiveState(selectedActorId)
      .then((result) => {
        if (cancelled) return
        setPlan(result.current_plan)
        setCurrentIndex(result.current_plan?.node_count ? result.current_plan.node_count - 1 : 0)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedActorId, refreshSeq])

  const actorName = selectedActorId ? actorsById[selectedActorId]?.name ?? selectedActorId : null
  const steps = plan?.steps ?? []

  const nodes = useMemo(
    () => (plan ? steps.map((name, index) => ({ name, state: stepState(index, plan, currentIndex) })) : []),
    [plan, steps, currentIndex],
  )

  return <PanelContainer title="Execution Graph"><div className="lwe-execution-graph-panel">
    <div className="lwe-execution-graph-toolbar">
      <div>
        <span className="lwe-execution-graph-goal">{plan?.goal || (actorName ? `${actorName}'s plan` : 'Execution DAG')}</span>
        {plan && <span className="lwe-execution-graph-meta">{steps.length} step{steps.length === 1 ? '' : 's'} · {plan.completed_nodes} / {plan.node_count} completed</span>}
      </div>
      <div className="lwe-execution-graph-actions">
        <button type="button" onClick={() => setCurrentIndex((index) => Math.min(index + 1, Math.max(steps.length - 1, 0)))} disabled={!plan || currentIndex >= steps.length - 1}>Step</button>
        <button type="button" onClick={() => setCurrentIndex(0)} disabled={!plan}>Reset</button>
      </div>
    </div>
    <div className="lwe-execution-graph-legend"><span className="completed">Completed</span><span className="running">Running</span><span className="failed">Failed</span><span className="pending">Pending</span></div>
    {!selectedActorId && <div className="lwe-execution-graph-empty">Select an actor to see its real Execution DAG.</div>}
    {selectedActorId && loading && <div className="lwe-execution-graph-empty">Loading plan…</div>}
    {selectedActorId && !loading && error && <div className="lwe-execution-graph-empty">{error}</div>}
    {selectedActorId && !loading && !error && !plan && <div className="lwe-execution-graph-empty">No plan recorded yet for {actorName}.</div>}
    {plan && steps.length === 0 && <div className="lwe-execution-graph-empty">{actorName}'s latest plan produced no steps.</div>}
    {plan && steps.length > 0 && <div className="lwe-execution-graph-canvas">
      {nodes.map((node, index) => <div className="lwe-execution-graph-column" key={`${node.name}-${index}`}>
        <div className={`lwe-execution-node lwe-execution-node-${node.state}`}>
          <span className="lwe-execution-node-dot" />{node.name}
        </div>
        {index < nodes.length - 1 && <span className="lwe-execution-graph-connector">→</span>}
      </div>)}
    </div>}
  </div></PanelContainer>
}
