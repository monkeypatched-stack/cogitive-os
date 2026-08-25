import { useEffect } from 'react'
import { useConnectionStore } from '../store/connectionStore'

const WS_PATH = import.meta.env.VITE_WS_PATH ?? '/api/v1/agentos/ws/status'
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 15000

function resolveWsUrl(path: string): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined
  if (explicit) return explicit
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

/**
 * Real WebSocket connection to the FastAPI backend's status socket
 * (api/routes/ws.py), with exponential backoff reconnect. Connection
 * status/last message are written into connectionStore so any panel
 * can read them without prop drilling — call this hook exactly once
 * (App.tsx), not per-panel.
 */
export function useWebSocket() {
  const setWsStatus = useConnectionStore((s) => s.setWsStatus)
  const setLastMessage = useConnectionStore((s) => s.setLastMessage)

  useEffect(() => {
    // All mutable state below is local to this one effect invocation, not
    // a ref shared across invocations. React StrictMode double-invokes
    // this effect in dev (mount -> cleanup -> remount on the same
    // component instance); with a shared ref, the second invocation's
    // reset-on-mount line stomps on the first invocation's "disposed"
    // flag while its aborted socket is still asynchronously closing,
    // un-cancelling that socket's reconnect timer and resurrecting it as
    // a second, permanently-live duplicate connection (confirmed live:
    // two /ws/status sockets both open and heartbeating from one page
    // load). A plain closure can't leak across invocations the way a ref
    // can, so each invocation's socket/timer lifecycle stays isolated.
    let disposed = false
    let socket: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0

    const connect = () => {
      setWsStatus('connecting')
      socket = new WebSocket(resolveWsUrl(WS_PATH))

      socket.onopen = () => {
        attempt = 0
        setWsStatus('open')
      }

      socket.onmessage = (event) => {
        try {
          setLastMessage(JSON.parse(event.data))
        } catch {
          setLastMessage(event.data)
        }
      }

      socket.onerror = () => {
        setWsStatus('error')
      }

      socket.onclose = () => {
        setWsStatus('closed')
        if (disposed) return
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
        attempt += 1
        timer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      socket?.close()
    }
  }, [setLastMessage, setWsStatus])
}
