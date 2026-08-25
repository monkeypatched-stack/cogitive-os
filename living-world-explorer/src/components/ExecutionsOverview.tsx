import type { CSSProperties } from 'react'
import type { ActorCognitiveState } from '../api/cognitiveClient'
import { formatTime } from './inspectorPrimitives'
import './GroundingDebugger.css'

function outcomeAccent(outcome: string): string {
  const o = outcome.toLowerCase()
  if (o.includes('fail') || o.includes('error')) return '#B91C1C'
  if (o.includes('partial') || o.includes('pending') || o.includes('progress') || o.includes('waiting')) return '#B45309'
  return '#047857'
}

/**
 * The Dashboard's home surface — unlike the Execution Debugger's Grounding
 * tab (which drills into one execution's grounding evidence), this is
 * never scoped to a single execution: it's every real execution this
 * actor has ever run, sourced from the same cognitive-state fetch
 * DataSourcesPanel already made. Clicking a row hands that execution's
 * real ID to the caller, which is how the Dashboard sends you into the
 * Debugger already scoped to it rather than the current "latest" default.
 */
export function ExecutionsOverview({
  cognitiveState, actorName, onOpenExecution,
}: {
  cognitiveState: ActorCognitiveState | null
  actorName: string
  onOpenExecution: (executionId: string) => void
}) {
  const history = cognitiveState?.execution_history ?? []
  const successCount = history.filter((e) => e.outcome.toLowerCase() === 'success').length
  const failCount = history.filter((e) => e.outcome.toLowerCase().includes('fail')).length
  const rewards = history.map((e) => e.reward).filter((r): r is number => typeof r === 'number')
  const avgReward = rewards.length > 0 ? rewards.reduce((a, b) => a + b, 0) / rewards.length : null

  return (
    <div className="lwe-gd">
      <div className="lwe-gd-meta">
        <div className="lwe-gd-meta-item">Actor: <b>{actorName}</b></div>
        <div className="lwe-gd-meta-item">Total Executions: <b>{history.length}</b></div>
        <div className="lwe-gd-meta-item">Success Rate: <b>{history.length > 0 ? `${Math.round((successCount / history.length) * 100)}%` : 'Not available'}</b></div>
      </div>

      <div className="lwe-gd-metrics">
        <div className="lwe-gd-metric" style={{ ['--gd-accent' as string]: '#1D4ED8' } as CSSProperties}>
          <div className="lwe-gd-metric-icon">▤</div>
          <div className="lwe-gd-metric-value">{history.length}</div>
          <div className="lwe-gd-metric-label">Total Executions</div>
        </div>
        <div className="lwe-gd-metric" style={{ ['--gd-accent' as string]: '#047857' } as CSSProperties}>
          <div className="lwe-gd-metric-icon">✓</div>
          <div className="lwe-gd-metric-value">{successCount}</div>
          <div className="lwe-gd-metric-label">Successful</div>
        </div>
        <div className="lwe-gd-metric" style={{ ['--gd-accent' as string]: '#B91C1C' } as CSSProperties}>
          <div className="lwe-gd-metric-icon">✗</div>
          <div className="lwe-gd-metric-value">{failCount}</div>
          <div className="lwe-gd-metric-label">Failed</div>
        </div>
        <div className="lwe-gd-metric" style={{ ['--gd-accent' as string]: '#6D28D9' } as CSSProperties}>
          <div className="lwe-gd-metric-icon">Σ</div>
          <div className="lwe-gd-metric-value">{avgReward != null ? avgReward.toFixed(2) : '—'}</div>
          <div className="lwe-gd-metric-label">Avg Reward</div>
        </div>
      </div>

      <div className="lwe-gd-card" style={{ minHeight: 0 }}>
        <div className="lwe-gd-card-head">
          <div>
            <div className="lwe-gd-card-title">All Executions</div>
            <div className="lwe-gd-card-subtitle">{history.length} recorded — click any row to inspect its grounding</div>
          </div>
        </div>
        <div className="lwe-gd-card-body">
          {history.length === 0 ? <div className="lwe-gd-card-empty">No executions recorded for this actor yet.</div> : (
            history.map((entry, i) => {
              const execId = typeof entry.metadata.execution_id === 'string' ? entry.metadata.execution_id : ''
              return (
                <div key={i} className="lwe-gd-row" onClick={() => execId && onOpenExecution(execId)}
                  role={execId ? 'button' : undefined} tabIndex={execId ? 0 : undefined}>
                  <span className="lwe-gd-row-dot" style={{ background: outcomeAccent(entry.outcome) }} />
                  <span className="lwe-gd-row-main">{entry.goal || 'Not recorded'}</span>
                  <span className="lwe-gd-row-time">{formatTime(entry.start_time)}</span>
                  <span className="lwe-gd-row-badge" style={{ ['--gd-accent' as string]: outcomeAccent(entry.outcome) } as CSSProperties}>{entry.outcome || 'unknown'}</span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
