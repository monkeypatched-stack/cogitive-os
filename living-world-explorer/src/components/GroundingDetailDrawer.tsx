import type { ReactNode } from 'react'
import './GroundingDebugger.css'

export interface DrawerField {
  label: string
  value: ReactNode
  mono?: boolean
}

export interface DrawerListEntry { primary: string; secondary?: string }

export interface DrawerContent {
  title: string
  subtitle?: string
  fields: DrawerField[]
  list?: DrawerListEntry[]
  listLabel?: string
}

/** One reusable click-to-inspect drawer shared by every card in the
 * Grounding tab (experiences, executions, context events, external
 * events, diff entries, graph nodes) — every real retrieved item already
 * carries its own provenance (source, confidence, timestamp,
 * evidence_ids), so this renders whatever fields the caller supplies
 * rather than special-casing each data type. */
export function GroundingDetailDrawer({ content, onClose }: { content: DrawerContent | null; onClose: () => void }) {
  if (!content) return null
  return (
    <div className="lwe-gd-drawer-backdrop" onClick={onClose}>
      <aside className="lwe-gd-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="lwe-gd-drawer-header">
          <div>
            <div className="lwe-gd-drawer-title">{content.title}</div>
            {content.subtitle && <div className="lwe-gd-drawer-subtitle">{content.subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <dl className="lwe-gd-drawer-fields">
          {content.fields.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd className={f.mono ? 'mono' : undefined}>{f.value}</dd>
            </div>
          ))}
          {content.list && content.list.length > 0 && (
            <div>
              <dt>{content.listLabel ?? 'Items'} ({content.list.length})</dt>
              <dd>
                {content.list.map((item, i) => (
                  <div className="lwe-gd-drawer-list-item" key={i}>
                    {item.primary}
                    {item.secondary && <div style={{ color: '#9aa3af', fontSize: 10, marginTop: 2 }}>{item.secondary}</div>}
                  </div>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </aside>
    </div>
  )
}
