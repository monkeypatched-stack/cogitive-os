import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  // What the fallback should call this section, e.g. "Execution Debugger" —
  // shown in the recovery message so a demo audience sees a named, bounded
  // failure ("Knowledge Graph panel hit an error") instead of a dead app.
  label: string
  // Compact renders inline (for a panel embedded in a larger page);
  // non-compact fills the viewport (for a top-level route boundary).
  compact?: boolean
}

interface State {
  error: Error | null
}

// React only catches render/lifecycle errors thrown by CHILDREN of this
// component, via getDerivedStateFromError/componentDidCatch — there is no
// hook equivalent, so this one spot is deliberately a class component
// (React's own supported mechanism, not a stylistic choice). Two
// boundaries use this: one wrapping the whole app (App.tsx) so a crash
// anywhere never produces a blank white screen, and one wrapping the
// Execution Debugger specifically (DataSourcesPanel.tsx) — the most
// complex, most frequently-changing surface — so a bad execution's data
// shape can't take down navigation and the rest of the dashboard with it.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary:${this.props.label}]`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className={`lwe-error-boundary${this.props.compact ? ' compact' : ''}`}>
        <div className="lwe-error-boundary-icon">⚠</div>
        <div className="lwe-error-boundary-title">{this.props.label} hit an error</div>
        <div className="lwe-error-boundary-detail">{error.message || String(error)}</div>
        <button type="button" className="lwe-error-boundary-retry" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    )
  }
}
