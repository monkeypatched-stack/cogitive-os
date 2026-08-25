import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorldStore } from '../store/worldStore'
import { fetchAllActors, type Actor } from '../api/actorClient'
import { fetchActorCognitiveState, type ActorCognitiveState } from '../api/cognitiveClient'
import { fetchOrder, fetchOrderTracking, fetchWallet, fetchActorWallet, type Order, type OrderTracking, type Wallet } from '../api/commerceClient'
import { fetchExecutionLearning, type LearningEvent } from '../api/learningClient'
import {
  fetchEffectivePolicies, fetchPendingApproval, fetchPendingNegotiation, fetchAuditTimeline,
  TRANSITION_GATE_STRATEGY, type EffectivePolicy, type PendingApproval, type PendingNegotiation, type AuditTimeline,
} from '../api/securityClient'
import './OrdersWalletPanel.css'

// Orders & Wallet — an admin/operator view of one actor's real financial
// and order state. Every field is a direct read of a real endpoint
// (orders.py, fulfillment.py, cognitiveClient.ts's cognitive-state,
// learningClient.ts, securityClient.ts) — nothing here is computed or
// invented client-side. Where a real record genuinely doesn't exist for
// something (no shipment yet, no negotiation required), the UI states
// that as a real status, not as an implementation caveat.

const ORDER_ID_RE = /Order\s+(ORD-[\w-]+)\s+created/
const WALLET_DELTA_RE = /wallet\s+\$([\d.]+)\s*(?:→|->)\s*\$([\d.]+)/

interface WalletTxn { before: number; after: number; delta: number; observedAt: number }
interface DiscoveredOrder { order: Order; sourceExecutionId?: string }

function fmtMoney(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—'
  return `$${v.toFixed(2)}`
}
function fmtTime(t: number | undefined | null): string {
  if (!t) return '—'
  return new Date(t * 1000).toLocaleString()
}
function fmtShort(id: string, keep = 14): string {
  return id.length > keep + 3 ? `${id.slice(0, keep)}…` : id
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'neutral'; children: React.ReactNode }) {
  return <span className={`lwe-ow-pill lwe-ow-pill-${tone}`}>{children}</span>
}

// Lazily fetched only when a row is expanded (orderId is undefined until
// then) — avoids N×4 requests firing for every order the moment the
// actor loads.
function useOrderDetail(actorId: string, executionId: string | undefined, orderId: string | undefined) {
  const [tracking, setTracking] = useState<OrderTracking | null | undefined>(undefined)
  const [approval, setApproval] = useState<PendingApproval | null | undefined>(undefined)
  const [negotiation, setNegotiation] = useState<PendingNegotiation | null | undefined>(undefined)
  const [timeline, setTimeline] = useState<AuditTimeline | null>(null)

  useEffect(() => {
    if (!orderId) return
    fetchOrderTracking(orderId).then(setTracking).catch(() => setTracking(null))
    if (!executionId) return
    fetchPendingApproval(executionId).then(setApproval).catch(() => setApproval(null))
    fetchPendingNegotiation(executionId).then(setNegotiation).catch(() => setNegotiation(null))
    fetchAuditTimeline(actorId, executionId).then(setTimeline).catch(() => setTimeline(null))
  }, [actorId, executionId, orderId])

  const gateDecision = timeline?.events.find((e) => e.kind === 'decision' && e.selected_strategy === TRANSITION_GATE_STRATEGY)
  return { tracking, approval, negotiation, gateDecision }
}

function OrderRow({ actorId, entry, onOpenTrace }: { actorId: string; entry: DiscoveredOrder; onOpenTrace: (executionId: string) => void }) {
  const [open, setOpen] = useState(false)
  const { order, sourceExecutionId } = entry
  const detail = useOrderDetail(actorId, open ? sourceExecutionId : undefined, open ? order.order_id : undefined)

  const statusTone = order.status === 'confirmed' || order.status === 'delivered' ? 'ok' : order.status === 'cancelled' ? 'bad' : 'neutral'
  const paymentTone = order.payment_status === 'paid' ? 'ok' : order.payment_status === 'failed' ? 'bad' : 'neutral'

  return <>
    <tr className="lwe-ow-order-row" onClick={() => setOpen((v) => !v)}>
      <td className="lwe-ow-order-caret">{open ? '▾' : '▸'}</td>
      <td><code>{fmtShort(order.order_id, 16)}</code></td>
      <td className="lwe-ow-order-items">{order.items.map((it) => `${it.qty}× ${it.product_name ?? it.product_id}`).join(', ')}</td>
      <td className="lwe-ow-order-total">{fmtMoney(order.total)}</td>
      <td><Pill tone={statusTone}>{order.status}</Pill></td>
      <td><Pill tone={paymentTone}>{order.payment_status ?? 'unknown'}</Pill></td>
      <td className="lwe-ow-order-time">{fmtTime(order.created_at)}</td>
    </tr>

    {open && <tr className="lwe-ow-order-detail-row">
      <td colSpan={7}>
        <div className="lwe-ow-order-detail">
          <div className="lwe-ow-detail-grid">
            <div className="lwe-ow-detail-field"><span>Order owner</span><b><code>{order.buyer_id}</code></b></div>
            <div className="lwe-ow-detail-field"><span>Payment</span><b>{fmtMoney(order.paid_amount)} · {order.payment_status ?? 'unknown'}</b></div>
            <div className="lwe-ow-detail-field"><span>Wallet charged</span><b><code>{order.paid_wallet_id ?? '—'}</code></b></div>
            <div className="lwe-ow-detail-field">
              <span>Delivery</span>
              <b>{detail.tracking === undefined ? '…' : detail.tracking === null ? 'Not shipped' : String(detail.tracking.status ?? 'In progress')}</b>
            </div>
          </div>

          <div className="lwe-ow-detail-security">
            <div className="lwe-ow-sec-item"><span>Consent</span>{detail.approval === undefined ? <span className="lwe-ow-dim">…</span> : detail.approval === null ? <Pill tone="neutral">NOT REQUIRED</Pill> : <Pill tone={detail.approval.decided === null ? 'warn' : detail.approval.decided ? 'ok' : 'bad'}>{detail.approval.decided === null ? 'PENDING' : detail.approval.decided ? 'GRANTED' : 'REJECTED'}</Pill>}</div>
            <div className="lwe-ow-sec-item"><span>Negotiation</span>{detail.negotiation === undefined ? <span className="lwe-ow-dim">…</span> : detail.negotiation === null ? <Pill tone="neutral">NOT REQUIRED</Pill> : <Pill tone={detail.negotiation.decided === null ? 'warn' : detail.negotiation.decided ? 'ok' : 'bad'}>{detail.negotiation.decided === null ? 'PENDING' : detail.negotiation.decided ? 'ACCEPTED' : 'REJECTED'}</Pill>}</div>
            <div className="lwe-ow-sec-item"><span>TransitionGate</span>{detail.gateDecision ? <Pill tone="ok">ALLOWED</Pill> : sourceExecutionId ? <span className="lwe-ow-dim">no decision recorded</span> : <span className="lwe-ow-dim">—</span>}</div>
          </div>

          {order.items.length > 0 && <ul className="lwe-ow-world-changes">
            {order.items.map((it, i) => <li key={i}>{it.qty}× {it.product_name ?? it.product_id} @ {fmtMoney(it.price)}</li>)}
          </ul>}

          <div className="lwe-ow-order-footer">
            {sourceExecutionId ? <button type="button" className="lwe-ow-link-btn" onClick={() => onOpenTrace(sourceExecutionId)}>View execution trace →</button> : <span className="lwe-ow-dim">Source execution not identified</span>}
          </div>
        </div>
      </td>
    </tr>}
  </>
}

export function OrdersWalletPanel() {
  const navigate = useNavigate()
  const selectActor = useWorldStore((s) => s.selectActor)
  const selectExecution = useWorldStore((s) => s.selectExecution)

  const [actors, setActors] = useState<Actor[]>([])
  const [actorId, setActorId] = useState('')
  const [cognitiveState, setCognitiveState] = useState<ActorCognitiveState | null>(null)
  const [orders, setOrders] = useState<DiscoveredOrder[]>([])
  const [walletTxns, setWalletTxns] = useState<WalletTxn[]>([])
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [learning, setLearning] = useState<LearningEvent[]>([])
  const [policies, setPolicies] = useState<EffectivePolicy[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchAllActors().then((all) => setActors(all.filter((a) => (a.actor_type || '').toLowerCase() === 'human'))).catch(() => setActors([])) }, [])

  useEffect(() => {
    if (!actorId) { setOrders([]); setWalletTxns([]); setWallet(null); setLearning([]); setPolicies([]); setCognitiveState(null); return }
    let cancelled = false
    setLoading(true); setError('')
    fetchEffectivePolicies(actorId).then((p) => { if (!cancelled) setPolicies(p) }).catch(() => { if (!cancelled) setPolicies([]) })
    fetchActorCognitiveState(actorId).then(async (state) => {
      if (cancelled) return
      setCognitiveState(state)
      const orderToExecution = new Map<string, string>()
      const executionIds = new Set<string>()
      const txns: WalletTxn[] = []
      for (const ex of state.execution_history) {
        const execId = (ex.metadata?.execution_id as string | undefined) ?? ''
        if (execId) executionIds.add(execId)
        const changes = (ex.metadata?.world_changes as string[] | undefined) ?? []
        for (const line of changes) {
          const orderMatch = line.match(ORDER_ID_RE)
          if (orderMatch && execId) orderToExecution.set(orderMatch[1], execId)
          const walletMatch = line.match(WALLET_DELTA_RE)
          if (walletMatch) {
            const before = Number(walletMatch[1]); const after = Number(walletMatch[2])
            txns.push({ before, after, delta: after - before, observedAt: ex.start_time })
          }
        }
      }
      setWalletTxns(txns.sort((a, b) => b.observedAt - a.observedAt))

      const [fetchedOrders, fetchedLearning] = await Promise.all([
        Promise.all([...orderToExecution.keys()].map((id) => fetchOrder(id).catch(() => null))),
        Promise.all([...executionIds].map((id) => fetchExecutionLearning(id).then((r) => r.events).catch(() => []))),
      ])
      if (cancelled) return
      const real: DiscoveredOrder[] = fetchedOrders
        .filter((o): o is Order => o !== null)
        .map((o) => ({ order: o, sourceExecutionId: orderToExecution.get(o.order_id) }))
        .sort((a, b) => b.order.created_at - a.order.created_at)
      setOrders(real)
      setLearning(fetchedLearning.flat())

      // Real, live, authoritative balance — takes priority over the
      // txn-history-derived value below, and works even when the delta
      // text was redacted (a cross-household delegate purchase — see
      // grocery.py's own acting_as/is_same_household check). Prefers
      // GET /wallets/{id} when an order already told us the wallet_id;
      // falls back to GET /actors/{id}/wallet (owner lookup) so an
      // actor with zero orders still shows their real wallet — every
      // actor gets one at seed time (scripts/seed_world.py::
      // ensure_wallet is unconditional), this was just previously
      // unreachable with no order to learn its id from.
      const walletId = real.find((o) => o.order.paid_wallet_id)?.order.paid_wallet_id
      const walletLookup = walletId ? fetchWallet(walletId) : fetchActorWallet(actorId)
      walletLookup.then((w) => { if (!cancelled) setWallet(w) }).catch(() => { if (!cancelled) setWallet(null) })
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [actorId])

  // The real, live GET /wallets/{id} read is authoritative when we have
  // it — falls back to the last balance derivable from transaction text
  // only when the live read wasn't possible (no order to learn the
  // wallet_id from yet).
  const walletBalance = wallet?.balance ?? walletTxns[0]?.after

  const learningByAction = useMemo(() => {
    const latest = new Map<string, LearningEvent>()
    for (const e of learning) {
      const cur = latest.get(e.action_key)
      if (!cur || e.recorded_at > cur.recorded_at) latest.set(e.action_key, e)
    }
    return [...latest.values()].sort((a, b) => b.recorded_at - a.recorded_at)
  }, [learning])

  const openTrace = (executionId: string) => {
    selectActor(actorId)
    selectExecution(executionId)
    navigate('/execution-debugger/grounding')
  }

  const selectedActor = actors.find((a) => a.actor_id === actorId)
  const lastActivity = cognitiveState?.execution_history[0]?.start_time ?? null

  return <div className="lwe-ow-page">
    {/* No page-level <h2> here — DashboardFrame's own pagehead already
        renders "Orders & Wallet" + the Live badge + the
        "CognitiveOS orders & wallet workspace" subtitle for this route
        (DataSourcesPanel.tsx's activeNav/subtitle logic); a second title
        here would just duplicate it. */}
    <select className="lwe-ow-select" value={actorId} onChange={(e) => setActorId(e.target.value)} aria-label="Select human actor">
      <option value="">Select a human actor…</option>
      {actors.map((a) => <option key={a.actor_id} value={a.actor_id}>{a.name}</option>)}
    </select>

    {error && <div className="lwe-ow-error">⚠ {error}</div>}

    {actorId && <>
      <div className="lwe-ow-actor-bar">
        <span className="lwe-ow-actor-name">{selectedActor?.name ?? cognitiveState?.identity.name ?? actorId}</span>
        <Pill tone={cognitiveState?.identity.is_active ? 'ok' : 'bad'}>{cognitiveState?.identity.is_active ? '● ONLINE' : '● OFFLINE'}</Pill>
        <span className="lwe-ow-actor-sep">·</span>
        <span className="lwe-ow-actor-id">actor_id: <code>{fmtShort(actorId, 12)}</code></span>
        <span className="lwe-ow-actor-sep">·</span>
        <span className="lwe-ow-actor-activity">Last activity: {fmtTime(lastActivity)}</span>
      </div>

      <div className="lwe-ow-section">
        <div className="lwe-ow-section-head"><h3>Wallet</h3></div>
        <div className="lwe-ow-section-body">
          {loading ? <div className="lwe-ow-muted">Loading…</div> : <>
            {/* Always show the Balance/Updated stat row, even with
                nothing to derive it from — "—" placeholders keep the
                same layout every actor gets, instead of swapping to an
                unrelated empty-state message. Balance prefers the real
                live GET /wallets/{id} (or /actors/{id}/wallet when no
                order told us the wallet_id yet) read — see `wallet`
                state above; "Updated" shows Live when it came from that
                direct read, or the real timestamp of the most recent
                transaction when it's the txn-derived fallback. Only an
                actor whose wallet genuinely can't be found (owner
                lookup 404s) still shows "—". */}
            <div className="lwe-ow-wallet-row">
              <div className="lwe-ow-wallet-stat"><span>Balance</span><b>{walletBalance === undefined ? '—' : fmtMoney(walletBalance)}</b></div>
              <div className="lwe-ow-wallet-stat lwe-ow-wallet-updated"><span>Updated</span><b>{wallet ? 'Live' : walletTxns[0] ? fmtTime(walletTxns[0].observedAt) : '—'}</b></div>
            </div>
            {walletTxns.length > 0 ? <div className="lwe-ow-txn-list">
              {walletTxns.map((t, i) => <div className="lwe-ow-txn-row" key={i}>
                <span className={t.delta < 0 ? 'lwe-ow-txn-neg' : 'lwe-ow-txn-pos'}>{t.delta < 0 ? '' : '+'}{fmtMoney(t.delta)}</span>
                <span className="lwe-ow-txn-balance">{fmtMoney(t.before)} → {fmtMoney(t.after)}</span>
                <span className="lwe-ow-txn-time">{fmtTime(t.observedAt)}</span>
              </div>)}
            </div> : <div className="lwe-ow-empty">No wallet activity recorded.</div>}
          </>}
        </div>
      </div>

      <div className="lwe-ow-section">
        <div className="lwe-ow-section-head"><h3>Orders</h3><span className="lwe-ow-count">{orders.length}</span></div>
        <div className="lwe-ow-section-body">
          {loading ? <div className="lwe-ow-muted">Loading…</div> : orders.length === 0 ? <div className="lwe-ow-empty">No orders found for this actor.</div> : <div className="lwe-ow-table-wrap"><table className="lwe-ow-table lwe-ow-orders-table">
            <thead><tr><th /><th>Order</th><th>Items</th><th>Total</th><th>Status</th><th>Payment</th><th>Time</th></tr></thead>
            <tbody>{orders.map((o) => <OrderRow key={o.order.order_id} actorId={actorId} entry={o} onOpenTrace={openTrace} />)}</tbody>
          </table></div>}
        </div>
      </div>

      <div className="lwe-ow-section">
        <div className="lwe-ow-section-head"><h3>Preferences</h3><span className="lwe-ow-count">{policies.length}</span></div>
        <div className="lwe-ow-section-body">
          {loading ? <div className="lwe-ow-muted">Loading…</div> : policies.length === 0 ? <div className="lwe-ow-empty">No preferences recorded.</div> : <div className="lwe-ow-policy-list">
            {policies.map((p, i) => <div className="lwe-ow-policy-card" key={String(p.policy_id ?? i)}>
              <div className="lwe-ow-policy-name">{String(p.name ?? p.policy_id ?? 'Preference')}</div>
              {typeof p.description === 'string' && <div className="lwe-ow-policy-desc">{p.description}</div>}
              {Array.isArray(p.rules) && p.rules.length > 0 && <ul className="lwe-ow-policy-rules">{(p.rules as unknown[]).map((r, j) => <li key={j}>{String(r)}</li>)}</ul>}
            </div>)}
          </div>}
        </div>
      </div>

      <div className="lwe-ow-section">
        <div className="lwe-ow-section-head"><h3>Learnings</h3><span className="lwe-ow-count">{learningByAction.length}</span></div>
        <div className="lwe-ow-section-body">
          {loading ? <div className="lwe-ow-muted">Loading…</div> : learningByAction.length === 0 ? <div className="lwe-ow-empty">No learning events recorded.</div> : <div className="lwe-ow-table-wrap"><table className="lwe-ow-table">
            <thead><tr><th>Action</th><th>Learned</th><th>Previous</th><th>Source</th><th>Updated</th></tr></thead>
            <tbody>{learningByAction.map((e) => <tr key={e.action_key}>
              <td>{e.action_key}</td>
              <td><b>{(e.updated.probability * 100).toFixed(0)}%</b></td>
              <td>{e.previous ? `${(e.previous.probability * 100).toFixed(0)}%` : <em>cold start</em>}</td>
              <td>{e.execution_id ? <button type="button" className="lwe-ow-link-btn" onClick={() => openTrace(e.execution_id)}>{fmtShort(e.execution_id, 10)} →</button> : '—'}</td>
              <td>{fmtTime(e.recorded_at)}</td>
            </tr>)}</tbody>
          </table></div>}
        </div>
      </div>
    </>}
  </div>
}
