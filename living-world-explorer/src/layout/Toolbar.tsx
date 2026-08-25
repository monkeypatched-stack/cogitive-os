import { useEffect, useState } from 'react'
import { useThemeStore } from '../theme/themeStore'
import { useConnectionStore } from '../store/connectionStore'
import { useCycleStore } from '../store/cycleStore'
import './Toolbar.css'

function ConnectionBadge({ label, ok }: { label: string; ok: boolean | null }) {
  const state = ok === null ? 'pending' : ok ? 'ok' : 'down'
  return (
    <span className={`lwe-badge lwe-badge-${state}`}>
      <span className="lwe-badge-dot" />
      {label}
    </span>
  )
}

function PlanetaryTickControl() {
  const ticking = useCycleStore((s) => s.ticking)
  const lastResult = useCycleStore((s) => s.lastResult)
  const error = useCycleStore((s) => s.error)
  const tickSeq = useCycleStore((s) => s.tickSeq)
  const triggerTick = useCycleStore((s) => s.triggerTick)
  // Re-triggers the CSS pulse keyframe on every real cycle by giving
  // the element a fresh key — restarting the same class name wouldn't
  // replay the animation on repeated clicks.
  const [pulseKey, setPulseKey] = useState(0)

  useEffect(() => {
    if (tickSeq > 0) setPulseKey((k) => k + 1)
  }, [tickSeq])

  return (
    <div className="lwe-tick-control">
      <button type="button" className="lwe-tick-button" onClick={triggerTick} disabled={ticking}>
        <span key={pulseKey} className={`lwe-tick-pulse${ticking ? ' lwe-tick-pulse-active' : ''}`} />
        {ticking ? 'Ticking…' : '🌍 Planetary Tick'}
      </button>
      {lastResult && !error && (
        <span className="lwe-tick-summary">
          Cycle {lastResult.cycle_number} · {lastResult.actors_observed} actors ·{' '}
          {lastResult.interactions_routed} interactions · {Math.round(lastResult.duration_ms)}ms
        </span>
      )}
      {error && <span className="lwe-tick-error">{error}</span>}
    </div>
  )
}

export function Toolbar() {
  const mode = useThemeStore((s) => s.mode)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const wsStatus = useConnectionStore((s) => s.wsStatus)
  const apiLive = useConnectionStore((s) => s.apiLive)

  return (
    <header className="lwe-toolbar">
      <div className="lwe-toolbar-brand">Living World Explorer</div>
      <div className="lwe-toolbar-status">
        <ConnectionBadge label="API" ok={apiLive} />
        <ConnectionBadge label="WS" ok={wsStatus === 'open' ? true : wsStatus === 'connecting' ? null : false} />
      </div>
      <PlanetaryTickControl />
      <div className="lwe-toolbar-actions">
        <button type="button" className="lwe-theme-toggle" onClick={toggleTheme}>
          {mode === 'light' ? 'Dark mode' : 'Light mode'}
        </button>
      </div>
    </header>
  )
}
