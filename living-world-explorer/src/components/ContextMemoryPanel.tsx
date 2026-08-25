import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorldStore } from '../store/worldStore'
import { useRefreshStore } from '../store/refreshStore'
import {
  fetchActorCognitiveState, type ActorCognitiveState,
} from '../api/cognitiveClient'
import { readable } from './inspectorPrimitives'
import './ContextMemoryPanel.css'

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = 'semantic' | 'episodic' | 'belief' | 'plan'
type Filter = 'all' | Category

interface MemoryRow {
  id: string
  category: Category
  timestamp: number
  title: string
  detail: string
  /** For episodic task rows — chain of steps */
  chain?: string
  /** Outcome for episodic task rows */
  outcome?: 'success' | 'failed'
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'semantic', label: 'Semantic' },
  { key: 'episodic', label: 'Episodic' },
  { key: 'belief',   label: 'Beliefs' },
  { key: 'plan',     label: 'Plans' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function stateToRows(state: ActorCognitiveState): MemoryRow[] {
  const rows: MemoryRow[] = []

  // Semantic memory
  state.memory_semantic.forEach((entry, i) => {
    const best = [...entry.hypotheses].sort((a, b) => b.confidence - a.confidence)[0]
    rows.push({
      id: `semantic:${entry.subject}:${i}`,
      category: 'semantic',
      timestamp: entry.last_observation_time ?? 0,
      title: entry.subject,
      detail: best ? `${readable(best.object_value)}  ·  confidence ${best.confidence.toFixed(2)}` : 'No hypothesis',
    })
  })

  // Episodic memory
  state.memory_episodic.forEach((item, i) => {
    const steps = Array.isArray(item.metadata.steps) ? item.metadata.steps as string[] : []
    const chain = steps.length > 0
      ? ['Requested', ...steps].join(' → ')
      : undefined
    rows.push({
      id: `episodic:${item.node_id}:${i}`,
      category: 'episodic',
      timestamp: item.timestamp ?? 0,
      title: item.text || item.kind || 'Episodic event',
      detail: '',
      chain,
      outcome: item.kind === 'task_failed' ? 'failed' : steps.length > 0 ? 'success' : undefined,
    })
  })

  // Beliefs
  state.beliefs.forEach((b) => {
    rows.push({
      id: `belief:${b.entry_id}`,
      category: 'belief',
      timestamp: 0,
      title: `${b.subject} · ${b.predicate}`,
      detail: `${typeof b.value === 'string' ? b.value : JSON.stringify(b.value)}  ·  confidence ${b.confidence.toFixed(2)}`,
    })
  })

  // Plans
  state.execution_history.forEach((e, i) => {
    rows.push({
      id: `plan:${i}`,
      category: 'plan',
      timestamp: e.start_time ?? 0,
      title: e.goal || (e.metadata.goal as string) || 'Execution plan',
      detail: (e.metadata.status as string) || 'unknown',
    })
  })

  rows.sort((a, b) => b.timestamp - a.timestamp)
  return rows
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContextMemoryPanel() {
  const navigate = useNavigate()
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)
  const [state, setState] = useState<ActorCognitiveState | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [injectOpen, setInjectOpen] = useState(false)
  const [injectForm, setInjectForm] = useState({ eventType: 'observation', subject: '', predicate: '', value: '' })
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setState(null); setError('')
    if (!selectedActorId) return
    let cancelled = false
    fetchActorCognitiveState(selectedActorId)
      .then((result) => { if (!cancelled) setState(result) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [selectedActorId, refreshSeq])

  const allRows = useMemo(() => state ? stateToRows(state) : [], [state])

  const counts = useMemo(() => ({
    all:      allRows.length,
    semantic: allRows.filter((r) => r.category === 'semantic').length,
    episodic: allRows.filter((r) => r.category === 'episodic').length,
    belief:   allRows.filter((r) => r.category === 'belief').length,
    plan:     allRows.filter((r) => r.category === 'plan').length,
  }), [allRows])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return allRows.filter((row) => {
      if (filter !== 'all' && row.category !== filter) return false
      if (!query) return true
      return `${row.title} ${row.detail} ${row.chain ?? ''}`.toLowerCase().includes(query)
    })
  }, [allRows, filter, search])

  // Scroll list back to top whenever the active filter changes
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [filter])

  const handleInjectEvent = async () => {
    if (!selectedActorId || !injectForm.subject) return
    try {
      // TODO: wire to upsertBelief once exported from cognitiveClient
      setInjectOpen(false)
      setInjectForm({ eventType: 'observation', subject: '', predicate: '', value: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="lwe-cm-panel">
      {/* ── Controls bar ── */}
      <div className="lwe-cm-controls">
        <div className="lwe-cm-filters" role="group" aria-label="Memory filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              className={filter === f.key ? 'lwe-cm-filter-active' : ''}
              onClick={() => setFilter(f.key)}
            >
              {f.label} <span className="lwe-cm-filter-count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <input
          aria-label="Search memories"
          placeholder="Search memories…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className="lwe-cm-action-btn"
          onClick={() => navigate('/context-stream')}
        >
          ▶ Context Stream
        </button>
        <button
          type="button"
          className="lwe-cm-action-btn"
          onClick={() => setInjectOpen(true)}
        >
          + Inject
        </button>
      </div>

      {/* ── Status bar ── */}
      <div className="lwe-cm-status">
        {selectedActorId
          ? <span className="lwe-cm-status-live">Live</span>
          : <span>No actor selected</span>}
        {state && (
          <span>
            {filter === 'all'
              ? `All categories · ${visible.length} entries`
              : `Filtered: ${FILTERS.find((f) => f.key === filter)?.label} · ${visible.length} entries`}
          </span>
        )}
        {!state && !error && selectedActorId && <span>Loading…</span>}
        {error && <span className="lwe-cm-status-error">{error}</span>}
      </div>

      {/* ── Scrollable list ── */}
      <div className="lwe-cm-list" ref={listRef}>
        {!selectedActorId && (
          <div className="lwe-cm-empty">Select an actor to view memories.</div>
        )}
        {selectedActorId && !state && !error && (
          <div className="lwe-cm-empty">Loading cognitive state…</div>
        )}

        {state && visible.length === 0 && (
          <div className="lwe-cm-empty">No entries match.</div>
        )}

        {state && filter === 'all' && !search.trim() && (
          <div className="lwe-cm-stat-grid">
            {[
              { value: state.memory_semantic.length,   label: 'Semantic' },
              { value: state.memory_episodic.length,   label: 'Episodic' },
              { value: state.beliefs.length,           label: 'Beliefs' },
              { value: state.execution_history.length, label: 'Plans' },
            ].map(({ value, label }) => (
              <div key={label} className="lwe-cm-stat-card">
                <span className="lwe-cm-stat-value">{value}</span>
                <span className="lwe-cm-stat-label">{label}</span>
              </div>
            ))}
          </div>
        )}

        {state && visible.map((row) => (
          <article className="lwe-cm-row" key={row.id}>
            <time>{row.timestamp > 0 ? new Date(row.timestamp * 1000).toLocaleTimeString() : '—'}</time>
            <span className={`lwe-cm-badge lwe-cm-badge-${row.category}`}>{row.category}</span>
            <div>
              <div className="lwe-cm-row-title">{row.title}</div>
              {row.detail && <div className="lwe-cm-row-detail">{row.detail}</div>}
              {row.chain && <div className="lwe-cm-row-chain">{row.chain}</div>}
              {row.outcome && (
                <span className={`lwe-cm-outcome lwe-cm-outcome-${row.outcome}`}>
                  {row.outcome === 'success' ? 'Success' : 'Failed'}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* ── Inject Event Modal ── */}
      {injectOpen && (
        <div className="lwe-cm-modal-overlay" onClick={() => setInjectOpen(false)}>
          <div className="lwe-cm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lwe-cm-modal-header">
              <h3>Inject Context Event</h3>
              <button type="button" className="lwe-cm-modal-close" onClick={() => setInjectOpen(false)}>×</button>
            </div>
            <div className="lwe-cm-modal-body">
              <div>
                <label>Event Type</label>
                <select value={injectForm.eventType} onChange={(e) => setInjectForm({ ...injectForm, eventType: e.target.value })}>
                  <option value="observation">Observation</option>
                  <option value="belief">Belief</option>
                  <option value="goal">Goal</option>
                </select>
              </div>
              <div>
                <label>Subject</label>
                <input type="text" placeholder="e.g., Whole Milk" value={injectForm.subject}
                  onChange={(e) => setInjectForm({ ...injectForm, subject: e.target.value })} />
              </div>
              <div>
                <label>Predicate</label>
                <input type="text" placeholder="e.g., availability" value={injectForm.predicate}
                  onChange={(e) => setInjectForm({ ...injectForm, predicate: e.target.value })} />
              </div>
              <div>
                <label>Value</label>
                <input type="text" placeholder="e.g., in_stock" value={injectForm.value}
                  onChange={(e) => setInjectForm({ ...injectForm, value: e.target.value })} />
              </div>
            </div>
            <div className="lwe-cm-modal-footer">
              <button type="button" className="lwe-cm-modal-cancel" onClick={() => setInjectOpen(false)}>Cancel</button>
              <button type="button" className="lwe-cm-modal-submit" onClick={handleInjectEvent} disabled={!injectForm.subject}>
                Inject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
