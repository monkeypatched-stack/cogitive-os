import { apiClient } from './client'

// Real Broca AgentRegistry entries (api/routes/agents.py::_local_agents) —
// the same 295-agent registry the boot log's "Agents ✓ 295 Registered"
// line reports. No separate frontend agent model: this mirrors the API
// response field-for-field.
export interface AgentCard {
  agent_type: string
  description: string
  source: 'local' | 'nanda'
}

export function fetchAgents(): Promise<{ agents: AgentCard[]; total: number; local: number; remote: number }> {
  return apiClient.request('/agents?include_remote=false')
}

// Real Wolverine Runtime capabilities (kernel/runtime/runtime.py's
// Runtime._capabilities — the same dict Cerebellum's load_all_providers()
// and the domain-vertical capability loaders register into at boot).
// `type` is the actual Python implementation class name (e.g.
// "AnthropicCapability").
export interface CapabilityCard {
  name: string
  type: string
  available: boolean
  description: string
}

export function fetchCapabilities(): Promise<{ capabilities: CapabilityCard[]; total: number }> {
  return apiClient.request('/capabilities')
}

// Real ProviderRegistry (kernel/provider_registry.py) — a THIRD, distinct
// registry from Agents/Capabilities above: external services this
// runtime can discover remote AGENTS through (openclaw, n8n, nanda, ard).
// GET /providers (api/routes/discovery.py) reads request.app.state.
// _provider_registry, set for real at boot (kernel/kernel.py:573,
// `app.state._provider_registry = init_providers()`) — live-verified,
// unlike several other app.state attributes this session found were
// never actually set. created_at/health_* fields were added this session
// (Provider.check_health(), a real reachability check — GET the real URL,
// or a real CLI-availability check for a URL-less provider like OpenClaw)
// — health_status starts "unknown" and only ever changes via an actual
// check, never inferred from `available` (a config/registration flag).
export interface ProviderCard {
  name: string
  url: string
  available: boolean
  agents: number
  created_at: number
  health_status: 'unknown' | 'healthy' | 'unhealthy'
  health_checked_at: number | null
  latency_ms: number | null
  health_error: string
  // Real, live trust score (kernel/provider_registry.py::Provider.trust_score)
  // — starts neutral at 0.5, moves only from a real recorded execution
  // outcome (record_outcome(), called by ProviderRegistry.execute_agent()
  // after every real dispatch). A separate, provider-scoped mechanism from
  // AffiliationManager/TrustEngine (which is actor-to-actor and has no
  // notion of a Provider as a target) — added 2026-08-24.
  trust_score: number
  trust_outcomes: number
}

export function fetchProviders(): Promise<{ providers: ProviderCard[]; count: number }> {
  return apiClient.request('/providers')
}

export interface ProviderHealthResult { name: string; status: string; checked_at: number; latency_ms: number | null; error: string }
export function checkProviderHealth(name: string): Promise<ProviderHealthResult> {
  return apiClient.request(`/providers/${name}/health`, { method: 'POST' })
}
