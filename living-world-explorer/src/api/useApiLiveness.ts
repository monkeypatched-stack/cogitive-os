import { useEffect } from 'react'
import { checkLive } from './client'
import { useConnectionStore } from '../store/connectionStore'

const POLL_MS = 30000

/** Real FastAPI integration: polls /live and records reachability in
 * connectionStore. Independent of the WebSocket connection — a REST
 * check, not a WS one, so the two can disagree (e.g. WS proxy down but
 * REST fine) and the toolbar should show that honestly. */
export function useApiLiveness() {
  const setApiLive = useConnectionStore((s) => s.setApiLive)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        await checkLive()
        if (!cancelled) setApiLive(true)
      } catch {
        if (!cancelled) setApiLive(false)
      }
    }

    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [setApiLive])
}
