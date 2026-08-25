import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefreshStore } from '../store/refreshStore'
import { useWorldStore } from '../store/worldStore'
import {
  fetchSocietyCommunicationLog, fetchSocieties, fetchSocietyContext, fetchObservabilitySnapshot,
  sumCounterPrefix, type CommunicationLogEntry, type Society, type SocietyContextEvent, type ObservabilitySnapshot,
} from '../api/communicationClient'
import { fetchActors, type Actor } from '../api/actorClient'
import { circularLayout } from '../graph/layouts'
import './CommunicationPanel.css'

// ─── Communication workspace ────────────────────────────────────────────
// Every field here comes from real, already-wired runtime surfaces:
//   - GET /societies/{id}/communication-log — real AffiliationCommunication
//     Router.CommunicationDecision records (allowed AND denied).
//   - GET /societies/{id}/context?event_type=INTERACTION — real
//     SocietyContextStream events (AskActorCapability Q&A,
//     InteractionManager routed interactions, and TransactionCoordinator
//     negotiation rounds — all three publish here, discriminated below).
//   - GET /observability — the existing Lemon Metrics export, read for a
//     handful of real communication.*/game_theory.* counters.
// No second communication model, no fabricated counts: anything this
// backend does not actually track is shown as "Not instrumented", never
// a guessed zero.

type RowKind = 'ask-actor' | 'negotiation' | 'interaction' | 'generic'

interface CommRow {
  id: string
  kind: RowKind
  time: number
  senderId: string
  recipientId: string
  societyName: string
  description: string
  transactionId?: string
  correlationId?: string
  causationId?: string
  raw: SocietyContextEvent
}

function classifyEvent(event: SocietyContextEvent, societyName: string): CommRow {
  const payload = (event.payload ?? {}) as Record<string, unknown>
  const id = event.event_id ?? `${event.actor_id}-${event.timestamp}`
  const time = event.timestamp ?? 0
  const description = event.description ?? ''
  const correlationId = event.correlation_id || undefined
  const causationId = event.causation_id || undefined

  if (event.provenance === 'society:transaction') {
    return {
      id, kind: 'negotiation', time, societyName, description, correlationId, causationId,
      senderId: String(payload.originating_actor_id ?? event.actor_id ?? ''),
      recipientId: String(payload.target_actor_id ?? ''),
      transactionId: typeof payload.transaction_id === 'string' ? payload.transaction_id : undefined,
      raw: event,
    }
  }
  if (typeof payload.from_actor_id === 'string') {
    return {
      id, kind: 'ask-actor', time, societyName, description, correlationId, causationId,
      senderId: payload.from_actor_id, recipientId: String(payload.to_actor_id ?? ''), raw: event,
    }
  }
  if (Array.isArray(payload.participants)) {
    const participants = (payload.participants as unknown[]).map(String)
    const sender = event.actor_id ?? participants[0] ?? ''
    return {
      id, kind: 'interaction', time, societyName, description, correlationId, causationId,
      senderId: sender, recipientId: participants.filter((p) => p !== sender).join(', '), raw: event,
    }
  }
  return {
    id, kind: 'generic', time, societyName, description, correlationId, causationId,
    senderId: event.actor_id ?? '', recipientId: '', raw: event,
  }
}

const MAX_ROWS = 1000

const ROW_KIND_LABEL: Record<RowKind, string> = {
  'ask-actor': 'Ask Actor', negotiation: 'Negotiation Round', interaction: 'Interaction', generic: 'Event',
}

function CardValue({ value, sub }: { value: number | null; sub?: string }) {
  if (value === null) return <><div className="lwe-cw-card-value is-unavailable">Not instrumented</div>{sub && <div className="lwe-cw-card-sub">{sub}</div>}</>
  return <><div className="lwe-cw-card-value">{value.toLocaleString()}</div>{sub && <div className="lwe-cw-card-sub">{sub}</div>}</>
}

export function CommunicationPanel() {
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)
  const selectActor = useWorldStore((s) => s.selectActor)
  const navigate = useNavigate()

  const [societies, setSocieties] = useState<Society[]>([])
  const [actors, setActors] = useState<Actor[]>([])
  const [commLog, setCommLog] = useState<Array<CommunicationLogEntry & { societyName: string }>>([])
  const [rows, setRows] = useState<CommRow[]>([])
  const [observability, setObservability] = useState<ObservabilitySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedActorNodeId, setSelectedActorNodeId] = useState<string | null>(null)
  const [rowsTruncated, setRowsTruncated] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([fetchSocieties(), fetchActors(), fetchObservabilitySnapshot().catch(() => null)])
      .then(async ([socs, acts, obs]) => {
        setSocieties(socs)
        setActors(acts)
        setObservability(obs)

        const [logResults, contextResults] = await Promise.all([
          Promise.all(socs.map((s) => fetchSocietyCommunicationLog(s.society_id).catch(() => [] as CommunicationLogEntry[]))),
          Promise.all(socs.map((s) => fetchSocietyContext(s.society_id, 'INTERACTION').catch(() => ({ events: [] as SocietyContextEvent[] })))),
        ])

        const aggregatedLog = socs.flatMap((s, i) => logResults[i].map((entry) => ({ ...entry, societyName: s.name })))
        setCommLog(aggregatedLog)

        const aggregatedRows = socs.flatMap((s, i) => contextResults[i].events.map((e) => classifyEvent(e, s.name)))
        aggregatedRows.sort((a, b) => b.time - a.time)
        // This page is a live/refreshed recent-activity view, not a full
        // historical archive (the Context Stream page under DATA is that,
        // unbounded) — cap to the most recent MAX_ROWS across all
        // societies. Without this, a busy world (thousands of real
        // INTERACTION events accumulated between refreshes) makes the
        // graph/table recompute over an ever-growing array on every
        // render, which is real, observed sluggishness, not a rendering
        // bug — capping keeps this page responsive without hiding any
        // data (nothing here claims to be the complete history).
        setRowsTruncated(aggregatedRows.length > MAX_ROWS)
        setRows(aggregatedRows.slice(0, MAX_ROWS))
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load, refreshSeq])

  const actorName = useMemo(() => {
    const byId = new Map(actors.map((a) => [a.actor_id, a.name]))
    return (id: string) => byId.get(id) ?? id
  }, [actors])

  const counters = observability?.metrics?.counters
  const allowedCount = commLog.filter((e) => e.allowed).length
  const deniedCount = commLog.filter((e) => !e.allowed).length
  const affiliationResolutions = sumCounterPrefix(counters, 'communication.affiliation_resolutions')
  const routingDecisions = sumCounterPrefix(counters, 'communication.routing_decisions')
  const negotiationsCompleted = sumCounterPrefix(counters, 'game_theory.negotiations_completed')

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      actorName(r.senderId).toLowerCase().includes(q) ||
      actorName(r.recipientId).toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.societyName.toLowerCase().includes(q),
    )
  }, [rows, search, actorName])

  // Communication Graph: real actor nodes (union of comm-log + INTERACTION
  // event participants), real edges (one per CommunicationDecision — styled
  // by allowed/denied — plus one per resolvable-sender/recipient event).
  // Never inferred from Society/Knowledge Graph membership.
  const graph = useMemo(() => {
    const nodeIds = new Set<string>()
    const edges: Array<{ id: string; source: string; target: string; denied: boolean }> = []
    for (const entry of commLog) {
      if (!entry.sender_id || !entry.recipient_id) continue
      nodeIds.add(entry.sender_id); nodeIds.add(entry.recipient_id)
      edges.push({ id: entry.decision_id, source: entry.sender_id, target: entry.recipient_id, denied: !entry.allowed })
    }
    for (const row of rows) {
      if (!row.senderId || !row.recipientId || row.recipientId.includes(',')) continue
      nodeIds.add(row.senderId); nodeIds.add(row.recipientId)
      edges.push({ id: row.id, source: row.senderId, target: row.recipientId, denied: false })
    }
    return { nodeIds: [...nodeIds], edges }
  }, [commLog, rows])

  const dims = { w: 620, h: 400 }
  const positions = useMemo(
    () => circularLayout(graph.nodeIds, dims.w / 2, dims.h / 2, Math.min(dims.w, dims.h) / 2 - 60),
    [graph.nodeIds],
  )

  const goToActor = (actorId: string) => {
    if (!actorId) return
    selectActor(actorId)
  }

  // No "list transactions by id" route exists (a real, documented gap —
  // see the plan) — this cannot deep-link to the exact historical
  // session, only to the Negotiations page for the sender actor, where
  // the real Timeline-derived historical record is discoverable. Honest
  // about the limitation rather than pretending a direct lookup exists.
  const goToNegotiation = (senderId: string) => {
    if (senderId) selectActor(senderId)
    navigate('/negotiations')
  }

  return (
    <div className="lwe-cw-page">
      <div className="lwe-cw-heading">
        <div>
          <h2>Communication</h2>
          <p>Real communication substrate state — AffiliationCommunicationRouter decisions and SocietyContextStream INTERACTION events (Ask Actor Q&amp;A, routed interactions, negotiation rounds). Nothing here is fabricated; unavailable metrics say so explicitly.</p>
        </div>
        {!loading && <span className="lwe-cw-heading-meta">{commLog.length} decisions · {rows.length} events · {societies.length} societies</span>}
      </div>

      {error && <div className="lwe-cw-error">⚠ {error}</div>}
      {loading && <div className="lwe-inspector-muted" style={{ padding: 12 }}>Loading communication state…</div>}

      {!loading && (
        <>
          <div className="lwe-cw-cards">
            <div className="lwe-cw-card"><div className="lwe-cw-card-label">Allowed decisions</div><CardValue value={allowedCount} sub="communication-log, all societies" /></div>
            <div className="lwe-cw-card"><div className="lwe-cw-card-label">Denied decisions</div><CardValue value={deniedCount} sub="communication-log, all societies" /></div>
            <div className="lwe-cw-card"><div className="lwe-cw-card-label">Affiliation resolutions</div><CardValue value={affiliationResolutions} sub="observability counters" /></div>
            <div className="lwe-cw-card"><div className="lwe-cw-card-label">Routing decisions</div><CardValue value={routingDecisions} sub="observability counters" /></div>
            <div className="lwe-cw-card"><div className="lwe-cw-card-label">Negotiations completed</div><CardValue value={negotiationsCompleted} sub="game_theory.negotiations_completed" /></div>
            <div className="lwe-cw-card"><div className="lwe-cw-card-label">INTERACTION events observed</div><CardValue value={rows.length} sub="context stream, all societies" /></div>
            <div className="lwe-cw-card"><div className="lwe-cw-card-label">Belief-injection messages delivered</div><CardValue value={null} sub="cleared every tick, no counter exists" /></div>
            <div className="lwe-cw-card"><div className="lwe-cw-card-label">NATS transport status</div><CardValue value={null} sub="no health route exposes this" /></div>
          </div>

          <section className="lwe-cw-section">
            <div className="lwe-cw-section-head">
              <h3>Message Stream</h3>
              <span className="lwe-cw-badge lwe-cw-badge-refreshed">REFRESHED</span>
            </div>
            {rowsTruncated && (
              <div className="lwe-cw-note">Showing the {MAX_ROWS} most recent events out of more that exist — see Context Stream (under DATA) for the full unbounded history.</div>
            )}
            <div className="lwe-cw-toolbar">
              <input className="lwe-cw-search" placeholder="Search sender, recipient, society…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button type="button" className="lwe-cw-btn" onClick={load}>↻ Refresh</button>
            </div>
            <div className="lwe-cw-table-wrap">
              {filteredRows.length === 0
                ? <div className="lwe-cw-empty">No communication events recorded yet.</div>
                : <table className="lwe-cw-table">
                  <thead><tr><th>Time</th><th>Sender</th><th>Recipient</th><th>Type</th><th>Society</th><th>Description</th><th>Correlation</th><th>Causation</th></tr></thead>
                  <tbody>
                    {filteredRows.slice(0, 300).map((r) => (
                      <tr key={r.id}>
                        <td>{r.time ? new Date(r.time * 1000).toLocaleString() : 'Not recorded'}</td>
                        <td><button type="button" className="lwe-cw-row-link" onClick={() => goToActor(r.senderId)}>{actorName(r.senderId) || 'Not available'}</button></td>
                        <td>{r.recipientId ? r.recipientId.split(', ').map((id) => <button key={id} type="button" className="lwe-cw-row-link" onClick={() => goToActor(id)} style={{ marginRight: 4 }}>{actorName(id)}</button>) : 'Not available'}</td>
                        <td>
                          <span className={`lwe-cw-chip lwe-cw-chip-${r.kind === 'ask-actor' ? 'askactor' : r.kind === 'negotiation' ? 'negotiation' : r.kind === 'interaction' ? 'interaction' : 'generic'}`}>{ROW_KIND_LABEL[r.kind]}</span>
                          {r.kind === 'negotiation' && <button type="button" className="lwe-cw-row-link" style={{ marginLeft: 6 }} onClick={() => goToNegotiation(r.senderId)}>view →</button>}
                        </td>
                        <td>{r.societyName}</td>
                        <td>{r.description || 'Not available'}</td>
                        <td>{r.correlationId ? <code className="lwe-cw-id-chip" title={r.correlationId}>{r.correlationId.slice(0, 8)}</code> : 'Not available'}</td>
                        <td>{r.causationId ? <code className="lwe-cw-id-chip" title={r.causationId}>{r.causationId.slice(0, 8)}</code> : 'Not available'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>}
            </div>
          </section>

          <section className="lwe-cw-section lwe-cw-section-graph">
            <div className="lwe-cw-section-head">
              <h3>Communication Graph</h3>
              <span className="lwe-cw-heading-meta">{graph.nodeIds.length} actors · {graph.edges.length} edges</span>
            </div>
            <div className="lwe-cw-graph-card">
              <div className="lwe-cw-canvas">
                {graph.nodeIds.length === 0
                  ? <div className="lwe-cw-empty">No real communication relationships recorded yet.</div>
                  : <svg className="lwe-cw-svg" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet">
                    {graph.edges.map((e) => {
                      const sp = positions.get(e.source); const tp = positions.get(e.target)
                      if (!sp || !tp) return null
                      return <line key={e.id} className={`lwe-cw-edge${e.denied ? ' is-denied' : ''}`} x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y} />
                    })}
                    {graph.nodeIds.map((id) => {
                      const pos = positions.get(id)
                      if (!pos) return null
                      return (
                        <g key={id} className={`lwe-cw-node${selectedActorNodeId === id ? ' is-selected' : ''}`}
                          transform={`translate(${pos.x},${pos.y})`} onClick={() => setSelectedActorNodeId((cur) => (cur === id ? null : id))}>
                          <circle className="lwe-cw-node-circle" r={22} />
                          <text className="lwe-cw-node-label" textAnchor="middle" y={38}>{(actorName(id) || id).slice(0, 14)}</text>
                        </g>
                      )
                    })}
                  </svg>}
              </div>
              {selectedActorNodeId && (
                <aside className="lwe-cw-inspector">
                  <h4 style={{ margin: '0 0 10px' }}>{actorName(selectedActorNodeId)}</h4>
                  <dl className="lwe-inspector-fields">
                    <div><dt>Actor ID</dt><dd>{selectedActorNodeId}</dd></div>
                    <div><dt>As sender</dt><dd>{graph.edges.filter((e) => e.source === selectedActorNodeId).length} edges</dd></div>
                    <div><dt>As recipient</dt><dd>{graph.edges.filter((e) => e.target === selectedActorNodeId).length} edges</dd></div>
                  </dl>
                  <button type="button" className="lwe-cw-btn" onClick={() => goToActor(selectedActorNodeId)}>View in Actors →</button>
                </aside>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
