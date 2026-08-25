import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchProviders, fetchCapabilities, fetchAgents, checkProviderHealth,
  type ProviderCard, type CapabilityCard, type AgentCard,
} from '../api/capabilityClient'
import './ProvidersPanel.css'

// Providers — the real ProviderRegistry (kernel/provider_registry.py):
// external services this runtime can discover remote AGENTS through
// (openclaw, n8n, nanda, ard). Confirmed live and real (app.state.
// _provider_registry is actually set at boot — unlike several other
// app.state attributes this session found were dead). Health/discovery-
// timestamp support was added this session (Provider.check_health(), a
// real reachability check — GET the real URL, or a real CLI-availability
// check for a URL-less provider like OpenClaw) — health_status starts
// "unknown" and only changes via an actual check, never inferred from
// `available` (a config/registration flag, not a live signal — proven
// live: n8n is "available" (configured) but its own health check reports
// unhealthy, because nothing is actually listening on that port).
// Per-provider policy/authorization and a per-execution history log
// remain real, confirmed gaps — shown as explicit NOT TRACKED, never a
// fake ✓. Trust IS now real (Provider.trust_score, added 2026-08-24):
// a live score that only moves from an actual execute_agent() outcome
// through that provider, feeding discover_from_providers()'s ranking.
// Capability/Agent browsing (the deeper Wolverine/Broca registries) stays
// on the existing Capabilities & Agents page — this page links out to it
// rather than duplicating that logic.

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'neutral'; children: React.ReactNode }) {
  return <span className={`lwe-prov-pill lwe-prov-pill-${tone}`}>{children}</span>
}

function healthTone(status: string): 'ok' | 'warn' | 'bad' {
  return status === 'healthy' ? 'ok' : status === 'unhealthy' ? 'bad' : 'warn'
}

function trustTone(score: number): 'ok' | 'warn' | 'bad' {
  return score >= 0.65 ? 'ok' : score >= 0.35 ? 'warn' : 'bad'
}

function fmtTime(t: number | null | undefined): string {
  if (!t) return '—'
  return new Date(t * 1000).toLocaleString()
}

// A provider name that ALSO appears as an Agent (Broca) or Capability
// (Wolverine) entry — real, live-verified overlap (only "nanda" does,
// confirmed by direct query), not assumed identity across registries.
function ProviderRow({ provider, capability, agent, onOpenCapabilities, onHealthChecked }: {
  provider: ProviderCard; capability?: CapabilityCard; agent?: AgentCard
  onOpenCapabilities: () => void; onHealthChecked: (name: string, patch: Partial<ProviderCard>) => void
}) {
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)

  const runHealthCheck = async () => {
    setChecking(true)
    try {
      const r = await checkProviderHealth(provider.name)
      onHealthChecked(provider.name, { health_status: r.status as ProviderCard['health_status'], health_checked_at: r.checked_at, latency_ms: r.latency_ms, health_error: r.error })
    } catch (err) {
      onHealthChecked(provider.name, { health_status: 'unhealthy', health_error: err instanceof Error ? err.message : String(err) })
    } finally {
      setChecking(false)
    }
  }

  return <>
    <tr className="lwe-prov-row" onClick={() => setOpen((v) => !v)}>
      <td className="lwe-prov-caret">{open ? '▾' : '▸'}</td>
      <td className="lwe-prov-name">{provider.name}</td>
      <td><Pill tone={provider.available ? 'ok' : 'bad'}>{provider.available ? 'Available' : 'Unavailable'}</Pill></td>
      <td><Pill tone={healthTone(provider.health_status)}>{provider.health_status.toUpperCase()}</Pill></td>
      <td><Pill tone={trustTone(provider.trust_score)}>{provider.trust_score.toFixed(2)}</Pill></td>
      <td className="lwe-prov-endpoint">{provider.url || '—'}</td>
      <td>{provider.agents}</td>
      <td>{capability ? <Pill tone="neutral">Capability</Pill> : '—'}</td>
    </tr>
    {open && <tr className="lwe-prov-detail-row">
      <td colSpan={8}>
        <div className="lwe-prov-detail">
          <div className="lwe-prov-detail-grid">
            <div className="lwe-prov-field"><span>Type</span><b>External agent-discovery provider</b></div>
            <div className="lwe-prov-field"><span>Registered via</span><b>ProviderRegistry (kernel/provider_registry.py)</b></div>
            <div className="lwe-prov-field"><span>Endpoint</span><b>{provider.url || 'None configured'}</b></div>
            <div className="lwe-prov-field"><span>Registered this session</span><b>{fmtTime(provider.created_at)}</b></div>
            <div className="lwe-prov-field"><span>Agents discovered (this session)</span><b>{provider.agents}</b></div>
          </div>

          <div className="lwe-prov-health-card">
            <div className="lwe-prov-health-head">
              <Pill tone={healthTone(provider.health_status)}>{provider.health_status.toUpperCase()}</Pill>
              <button type="button" className="lwe-prov-health-btn" onClick={(e) => { e.stopPropagation(); runHealthCheck() }} disabled={checking}>{checking ? 'Checking…' : 'Test health'}</button>
            </div>
            <div className="lwe-prov-health-grid">
              <div><span>Last check</span><b>{fmtTime(provider.health_checked_at)}</b></div>
              <div><span>Latency</span><b>{provider.latency_ms !== null ? `${provider.latency_ms}ms` : '—'}</b></div>
              <div><span>Error</span><b>{provider.health_error || '—'}</b></div>
            </div>
          </div>

          <div className="lwe-prov-health-card">
            <div className="lwe-prov-health-head">
              <Pill tone={trustTone(provider.trust_score)}>TRUST {provider.trust_score.toFixed(2)}</Pill>
              <span className="lwe-prov-endpoint">{provider.trust_outcomes} recorded outcome{provider.trust_outcomes === 1 ? '' : 's'}</span>
            </div>
            <small style={{ color: '#94A3B8', fontSize: 11 }}>Real, provider-scoped trust (kernel/provider_registry.py::Provider.trust_score) — starts neutral at 0.50 and only moves from an actual execute_agent() outcome through this provider. A separate mechanism from actor-to-actor affiliation trust, which has no notion of a Provider as a target.</small>
          </div>

          <div className="lwe-prov-gap-grid">
            <div className="lwe-prov-gap"><span>Policy / Authorization</span><Pill tone="neutral">NOT TRACKED</Pill><small>No per-provider authorization or policy decision is recorded in this backend.</small></div>
            <div className="lwe-prov-gap"><span>Executions</span><Pill tone="neutral">NOT TRACKED</Pill><small>No execution history log is recorded per provider — only the aggregate trust_score above, which updates on outcomes but keeps no event list.</small></div>
          </div>

          {(capability || agent) && <div className="lwe-prov-overlap">
            <p className="lwe-prov-subhead">Also registered as</p>
            {capability && <button type="button" className="lwe-prov-link-btn" onClick={onOpenCapabilities}>Capability "{capability.name}" — {capability.available ? 'available' : 'unavailable'} ({capability.type}) →</button>}
            {agent && <button type="button" className="lwe-prov-link-btn" onClick={onOpenCapabilities}>Agent "{agent.agent_type}" (Broca registry) →</button>}
          </div>}
        </div>
      </td>
    </tr>}
  </>
}

export function ProvidersPanel() {
  const navigate = useNavigate()
  const [providers, setProviders] = useState<ProviderCard[]>([])
  const [capabilities, setCapabilities] = useState<CapabilityCard[]>([])
  const [agents, setAgents] = useState<AgentCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([fetchProviders(), fetchCapabilities(), fetchAgents()])
      .then(([p, c, a]) => { setProviders(p.providers); setCapabilities(c.capabilities); setAgents(a.agents) })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  const capByName = useMemo(() => new Map(capabilities.map((c) => [c.name, c])), [capabilities])
  const agentByType = useMemo(() => new Map(agents.map((a) => [a.agent_type, a])), [agents])
  const availableCount = providers.filter((p) => p.available).length
  const healthyCount = providers.filter((p) => p.health_status === 'healthy').length
  const openCapabilities = () => navigate('/providers')

  const patchProvider = (name: string, patch: Partial<ProviderCard>) => {
    setProviders((prev) => prev.map((p) => (p.name === name ? { ...p, ...patch } : p)))
  }

  return <div className="lwe-prov-page">
    {error && <div className="lwe-prov-error">⚠ {error}</div>}

    {!loading && <div className="lwe-prov-stats">
      <div className="lwe-prov-stat"><span>Providers</span><b>{providers.length}</b></div>
      <div className="lwe-prov-stat"><span>Available</span><b>{availableCount}</b></div>
      <div className="lwe-prov-stat"><span>Healthy</span><b>{healthyCount}</b></div>
      <div className="lwe-prov-stat lwe-prov-stat-link" onClick={openCapabilities}><span>Capabilities</span><b>{capabilities.length}</b></div>
      <div className="lwe-prov-stat lwe-prov-stat-link" onClick={openCapabilities}><span>Agents</span><b>{agents.length}</b></div>
    </div>}

    <div className="lwe-prov-section">
      <div className="lwe-prov-section-head"><h3>Providers</h3><span className="lwe-prov-count">{providers.length}</span></div>
      <div className="lwe-prov-section-body">
        {loading ? <div className="lwe-prov-muted">Loading…</div> : providers.length === 0 ? <div className="lwe-prov-empty">No providers registered.</div> : <div className="lwe-prov-table-wrap"><table className="lwe-prov-table">
          <thead><tr><th /><th>Provider</th><th>Status</th><th>Health</th><th>Trust</th><th>Endpoint</th><th>Agents</th><th>Also</th></tr></thead>
          <tbody>
            {providers.map((p) => <ProviderRow key={p.name} provider={p} capability={capByName.get(p.name)} agent={agentByType.get(p.name)} onOpenCapabilities={openCapabilities} onHealthChecked={patchProvider} />)}
          </tbody>
        </table></div>}
      </div>
    </div>

    <div className="lwe-prov-note">
      Health is a real, live check ("Test health" per row — GET the provider's real endpoint, or a CLI-availability check for a URL-less provider) and starts UNKNOWN until run once; it is never inferred from Status (a registration/config flag). Capability and Agent detail (search, filter, per-item inspection) stay on the existing <button type="button" className="lwe-prov-link-btn" onClick={openCapabilities}>Capabilities &amp; Agents</button> page — no live registry in this backend links a specific Agent to a specific Capability, or a Provider to the Capabilities it implements, beyond a provider sharing its own literal name with a same-named Capability/Agent entry (shown above only where that's actually true).
    </div>
  </div>
}
