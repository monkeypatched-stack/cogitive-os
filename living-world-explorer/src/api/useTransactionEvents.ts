import { useEffect, useState } from 'react'

function resolveWsUrl(path: string): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined
  if (explicit) {
    // VITE_WS_URL already points at the ws/status socket's own path in
    // useWebSocket.ts's usage; here we only want the origin, so strip any
    // path the env var might carry and append our own.
    try {
      const u = new URL(explicit)
      return `${u.protocol}//${u.host}${path}`
    } catch {
      // fall through to window.location below
    }
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

export type TransactionWsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export interface TransactionStreamEvent {
  type?: string
  [key: string]: unknown
}

/**
 * Real WebSocket connection to WS /ws/transactions/{transaction_id}
 * (api/routes/ws.py — kernel/society/transaction_event_hub.py::
 * TransactionEventHub), a genuinely different socket from the app-wide
 * /ws/status heartbeat useWebSocket.ts owns. Per-transaction, not a
 * singleton: only connects while `transactionId` is non-null, and tears
 * down/reconnects cleanly when it changes (same closure-per-effect-
 * invocation pattern useWebSocket.ts uses to avoid a real StrictMode
 * double-connect bug found there — see that file's comment).
 *
 * Deliberately does NOT auto-reconnect with backoff the way the status
 * socket does: TransactionEventHub holds only live, in-process
 * subscribers with no replay, so a closed transaction socket almost
 * always means the transaction reached a terminal state (or the process
 * restarted) — reconnecting forever against a transaction_id nothing is
 * publishing to anymore would misrepresent a finished/dead stream as
 * still trying to be live. `status` surfaces this honestly instead:
 * 'closed' means the stream ended, not "reconnecting."
 */
export function useTransactionEvents(transactionId: string | null) {
  const [events, setEvents] = useState<TransactionStreamEvent[]>([])
  const [status, setStatus] = useState<TransactionWsStatus>('idle')

  useEffect(() => {
    setEvents([])
    if (!transactionId) {
      setStatus('idle')
      return
    }

    let disposed = false
    setStatus('connecting')
    const socket = new WebSocket(resolveWsUrl(`/api/v1/agentos/ws/transactions/${transactionId}`))

    socket.onopen = () => { if (!disposed) setStatus('open') }
    socket.onmessage = (event) => {
      if (disposed) return
      try {
        const parsed = JSON.parse(event.data) as TransactionStreamEvent
        setEvents((prev) => [...prev, parsed])
      } catch {
        setEvents((prev) => [...prev, { type: 'raw', data: event.data }])
      }
    }
    socket.onerror = () => { if (!disposed) setStatus('error') }
    socket.onclose = () => { if (!disposed) setStatus('closed') }

    return () => {
      disposed = true
      socket.close()
    }
  }, [transactionId])

  return { events, status }
}
