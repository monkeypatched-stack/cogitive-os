import { apiClient } from './client'

// SittingFace — the real external knowledge-base repo (src/sittingface/
// somatic_compiler.py::SomaticCompiler), distinct from the simulated
// Living World's own ontology/world-state. These three endpoints
// (kernel/api/routes/sittingface.py) are its only real, already-existing
// surface; there is no per-item detail route, so this client only ever
// asks for collection-level shape (counts/types), never individual chart
// contents.
export interface SomaticChart {
  name: string
  chart_type: 'module' | 'capability' | 'agent'
}

export interface SomaticChartsSummary {
  total_charts: number
  by_type: { module: number; capability: number; agent: number }
  prompts_compiled: number
  chart_names: string[]
  charts: SomaticChart[]
}

export function fetchSomaticChartsSummary(): Promise<SomaticChartsSummary> {
  return apiClient.request<SomaticChartsSummary>('/somatic/charts')
}

export interface ChartCapabilityLink {
  chart: string
  capability_name: string
  platform: string
}

export interface SomaticCapabilitiesSummary {
  capabilities: string[]
  from_charts: string[]
  chart_capabilities: ChartCapabilityLink[]
}

export function fetchSomaticCapabilities(): Promise<SomaticCapabilitiesSummary> {
  return apiClient.request<SomaticCapabilitiesSummary>('/somatic/capabilities')
}

export interface SomaticPrompt {
  chart: string
  preamble: string
  steps: string[]
  review_gate: boolean
  constraints: string[]
}

export function fetchSomaticPrompts(): Promise<SomaticPrompt[]> {
  return apiClient.request<{ prompts: SomaticPrompt[] }>('/somatic/prompts').then((r) => r.prompts)
}
