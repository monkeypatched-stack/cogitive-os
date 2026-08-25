import { useEffect, useMemo, useState } from 'react'
import { PanelContainer } from './PanelContainer'
import { useWorldStore } from '../store/worldStore'
import { useRefreshStore } from '../store/refreshStore'
import { fetchActorCognitiveState, type ActorCognitiveState } from '../api/cognitiveClient'
import { ActorSection, ActorTable, formatTime, readable } from './inspectorPrimitives'

type Category = 'semantic' | 'episodic' | 'conversation'
type Filter = 'all' | Category

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'semantic', label: 'Semantic' },
  { key: 'episodic', label: 'Episodic' },
  { key: 'conversation', label: 'Conversation' },
]

export function MemoryPanel() {
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)
  const [state, setState] = useState<ActorCognitiveState | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setState(null); setError('')
    if (!selectedActorId) return
    let cancelled = false
    fetchActorCognitiveState(selectedActorId).then((result) => { if (!cancelled) setState(result) }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err))
    })
    return () => { cancelled = true }
  }, [selectedActorId, refreshSeq])

  const counts = useMemo(() => ({
    all: state ? state.memory_semantic.length + state.memory_episodic.length + state.memory_conversation.length : 0,
    semantic: state?.memory_semantic.length ?? 0,
    episodic: state?.memory_episodic.length ?? 0,
    conversation: state?.memory_conversation.length ?? 0,
  }), [state])

  const filteredSemantic = useMemo(() => {
    if (!state) return []
    if (filter !== 'all' && filter !== 'semantic') return []
    const query = search.trim().toLowerCase()
    if (!query) return state.memory_semantic
    return state.memory_semantic.filter((entry) => {
      const best = [...entry.hypotheses].sort((a, b) => b.confidence - a.confidence)[0]
      return entry.subject.toLowerCase().includes(query) ||
             readable(best?.object_value).toLowerCase().includes(query)
    })
  }, [state, filter, search])

  const filteredEpisodic = useMemo(() => {
    if (!state) return []
    if (filter !== 'all' && filter !== 'episodic') return []
    const query = search.trim().toLowerCase()
    if (!query) return state.memory_episodic
    return state.memory_episodic.filter((item) => {
      const steps = Array.isArray(item.metadata.steps) ? item.metadata.steps as string[] : []
      const chain = steps.length > 0 ? ['Requested', ...steps].join(' → ') : ''
      return item.text.toLowerCase().includes(query) ||
             chain.toLowerCase().includes(query)
    })
  }, [state, filter, search])

  const filteredConversation = useMemo(() => {
    if (!state) return []
    if (filter !== 'all' && filter !== 'conversation') return []
    const query = search.trim().toLowerCase()
    if (!query) return state.memory_conversation
    return state.memory_conversation.filter((event) => {
      return (event.description || '').toLowerCase().includes(query) ||
             (event.event_type || '').toLowerCase().includes(query)
    })
  }, [state, filter, search])

  // Forces ActorTable to remount when filter changes, clearing its internal filter state
  const tableResetKey = `${selectedActorId}-${filter}`

  return <PanelContainer title="Memories"><div className="lwe-inspector">
    {/* ── Filter controls ── */}
    <div className="lwe-inspector-tier" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              padding: '4px 8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: filter === f.key ? '#e3f2fd' : '#f5f5f5',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            {f.label} <span style={{ opacity: 0.7 }}>({counts[f.key]})</span>
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Search memories…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          flex: 1,
          minWidth: '150px',
          padding: '4px 8px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '11px',
        }}
      />
    </div>

    {error && <div className="lwe-inspector-error">{error}</div>}
    {!selectedActorId && <div className="lwe-inspector-muted">Select an actor to see memories.</div>}
    {selectedActorId && !state && !error && <div className="lwe-inspector-muted">Loading memories…</div>}
    {state && filter === 'all' && (
      <>
        <ActorSection title="Memory — Semantic">
          <div className="lwe-inspector-hint">Durable knowledge that recurred across multiple ticks.</div>
          {filteredSemantic.length > 0 ? (
            <ActorTable key={`semantic-${tableResetKey}`} columns={['Subject', 'Belief', 'Confidence']} rows={filteredSemantic.map((entry) => {
              const best = [...entry.hypotheses].sort((a, b) => b.confidence - a.confidence)[0]
              return { Subject: entry.subject, Belief: readable(best?.object_value), Confidence: best?.confidence.toFixed(2) ?? 'Not available' }
            })} />
          ) : (
            <div className="lwe-inspector-muted">No matching semantic memories.</div>
          )}
        </ActorSection>
        <ActorSection title="Memory — Episodic">
          {filteredEpisodic.length > 0 ? filteredEpisodic.map((item) => {
            const steps = Array.isArray(item.metadata.steps) ? item.metadata.steps as string[] : []
            const chain = steps.length > 0 ? ['Requested', ...steps, item.kind === 'task_failed' ? 'Outcome: Failed' : 'Outcome: Success'] : null
            return <div className="lwe-inspector-episode" key={item.node_id}><time className="lwe-inspector-episode-time">{formatTime(item.timestamp)}</time>{chain ? <div className="lwe-inspector-episode-chain">{chain.join(' → ')}</div> : <div className="lwe-inspector-episode-text">{item.text}</div>}</div>
          }) : <div className="lwe-inspector-muted">No matching episodic memories.</div>}
        </ActorSection>
        <ActorSection title="Memory — Conversation">
          {filteredConversation.length > 0 ? (
            <ActorTable key={`conversation-${tableResetKey}`} columns={['Time', 'Type', 'Summary']} rows={filteredConversation.map((event) => ({ Time: formatTime(event.timestamp), Type: event.event_type || 'interaction', Summary: event.description || 'Not available' }))} />
          ) : (
            <div className="lwe-inspector-muted">No matching conversation memories.</div>
          )}
        </ActorSection>
      </>
    )}
    {state && filter === 'semantic' && (
      <ActorSection title="Memory — Semantic">
        <div className="lwe-inspector-hint">Durable knowledge that recurred across multiple ticks.</div>
        {filteredSemantic.length > 0 ? (
          <ActorTable key={`semantic-${tableResetKey}`} columns={['Subject', 'Belief', 'Confidence']} rows={filteredSemantic.map((entry) => {
            const best = [...entry.hypotheses].sort((a, b) => b.confidence - a.confidence)[0]
            return { Subject: entry.subject, Belief: readable(best?.object_value), Confidence: best?.confidence.toFixed(2) ?? 'Not available' }
          })} />
        ) : (
          <div className="lwe-inspector-muted">No matching semantic memories.</div>
        )}
      </ActorSection>
    )}
    {state && filter === 'episodic' && (
      <ActorSection title="Memory — Episodic">
        {filteredEpisodic.length > 0 ? filteredEpisodic.map((item) => {
          const steps = Array.isArray(item.metadata.steps) ? item.metadata.steps as string[] : []
          const chain = steps.length > 0 ? ['Requested', ...steps, item.kind === 'task_failed' ? 'Outcome: Failed' : 'Outcome: Success'] : null
          return <div className="lwe-inspector-episode" key={item.node_id}><time className="lwe-inspector-episode-time">{formatTime(item.timestamp)}</time>{chain ? <div className="lwe-inspector-episode-chain">{chain.join(' → ')}</div> : <div className="lwe-inspector-episode-text">{item.text}</div>}</div>
        }) : <div className="lwe-inspector-muted">No matching episodic memories.</div>}
      </ActorSection>
    )}
    {state && filter === 'conversation' && (
      <ActorSection title="Memory — Conversation">
        {filteredConversation.length > 0 ? (
          <ActorTable key={`conversation-${tableResetKey}`} columns={['Time', 'Type', 'Summary']} rows={filteredConversation.map((event) => ({ Time: formatTime(event.timestamp), Type: event.event_type || 'interaction', Summary: event.description || 'Not available' }))} />
        ) : (
          <div className="lwe-inspector-muted">No matching conversation memories.</div>
        )}
      </ActorSection>
    )}
  </div></PanelContainer>
}
