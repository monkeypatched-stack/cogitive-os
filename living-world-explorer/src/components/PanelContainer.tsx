import type { ReactNode } from 'react'
import './PanelContainer.css'

interface PanelContainerProps {
  title: string
  children?: ReactNode
}

/** Shared chrome for every shell panel — title bar + body. All five
 * panels are empty placeholders in this prompt (no visualization yet);
 * this is the one place that changes when real content lands later. */
export function PanelContainer({ title, children }: PanelContainerProps) {
  return (
    <div className="lwe-panel">
      <div className="lwe-panel-title">{title}</div>
      <div className="lwe-panel-body">
        {children ?? <span className="lwe-panel-placeholder">No content yet</span>}
      </div>
    </div>
  )
}
