import type { VerificationRow, ImplStatus, TestStatus } from '../data/architectureVerification'
import './ArchitectureVerificationPanel.css'

function statusIcon(status: ImplStatus): { icon: string; cls: string } {
  if (status === 'IMPLEMENTED_AND_WIRED') return { icon: '✓', cls: 'ok' }
  if (status === 'PARTIAL') return { icon: '?', cls: 'warn' }
  return { icon: '✕', cls: 'bad' }
}

function testIcon(status: TestStatus): { icon: string; cls: string } {
  return status === 'COVERED' ? { icon: '✓', cls: 'ok' } : { icon: '?', cls: 'warn' }
}

export function ArchitectureVerificationPanel({ title, rows }: { title: string; rows: VerificationRow[] }) {
  return (
    <details className="lwe-av-panel">
      <summary>{title}</summary>
      <div className="lwe-av-disclaimer">
        Manually verified against source on 2026-08-10 by direct code reading — not computed at runtime. No self-check API exists in this codebase.
      </div>
      <div className="lwe-av-table-wrap">
        <table className="lwe-av-table">
          <thead>
            <tr>
              <th>Component</th><th>Status</th><th>Runtime path</th><th>Persistence</th><th>Observability</th><th>Tests</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const impl = statusIcon(row.implementationStatus)
              const test = testIcon(row.tests)
              return (
                <tr key={row.component}>
                  <td className="lwe-av-component">
                    {row.component}
                    {row.note && <span className="lwe-av-note">{row.note}</span>}
                  </td>
                  <td title={row.implementationStatus}><span className={`lwe-av-icon ${impl.cls}`}>{impl.icon}</span> {row.implementationStatus}</td>
                  <td className="lwe-av-runtime-path" title={row.wiring}>{row.runtimePath}</td>
                  <td>{row.persistence}</td>
                  <td>{row.observability === 'REAL_COUNTER' ? <span className="lwe-av-icon ok">✓</span> : <span className="lwe-av-icon warn">?</span>} {row.observability}</td>
                  <td><span className={`lwe-av-icon ${test.cls}`}>{test.icon}</span> {row.tests}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}
