import { apiClient } from './client'

// Mirrors GET /actors/{actor_id}/executions/{execution_id}/conversation —
// the real INTERACTION ContextEvents this actor's tick published
// (AskActor/RespondToInquiry/RecordAgreement), scoped to this execution's
// real time window. See kernel/society/context_stream.py::ContextEvent.
export interface ConversationMessageEvent {
  event_id: string
  event_type: string
  actor_id: string
  description: string
  payload: Record<string, unknown> | null
  confidence: number
  provenance: string
  timestamp: number
  version: number
}

export interface ExecutionConversation {
  actor_id: string
  execution_id: string
  message_count: number
  messages: ConversationMessageEvent[]
}

// Mirrors GET .../negotiation — real kernel/society/integration.py::
// _build_negotiation_trace output when this execution actually invoked a
// game-theoretic capability, or an explicit "not required" otherwise
// (never a fabricated negotiation).
export interface ExecutionNegotiation {
  actor_id: string
  execution_id: string
  negotiation_required: boolean
  reason: string
  candidate_strategies?: string[]
  utility_evaluation?: Array<{ name?: string; utility?: number; attributes?: Record<string, unknown> }>
  chosen_strategy?: string
  negotiation_outcome?: string | null
  is_competitive?: boolean
  is_cooperative?: boolean
  agreement_recorded?: boolean
  colleagues_involved?: string[]
}

// Mirrors GET .../game-theory — same underlying record as negotiation,
// reshaped into strategies/utilities/equilibrium.
export interface ExecutionGameTheory {
  actor_id: string
  execution_id: string
  negotiation_required: boolean
  reason?: string
  strategies: string[]
  utilities: Array<{ participant: string; utility: number }>
  chosen_strategy?: string
  equilibrium_kind?: string
  equilibrium: string
}

// Mirrors GET .../scenarios — the real Predict-stage scenario
// recommendation (kernel/pipeline/prediction/), including which scenario
// sources (Baseline + every registered counterfactual assumption)
// actually participated, not just the winning candidate. Every real
// execution has one; prediction_available is honestly false only when
// the plan itself was empty.
export interface ScenarioParticipation {
  scenarios_required: string[]
  scenarios_invoked: string[]
  scenarios_succeeded: string[]
  scenarios_failed: Array<{ label: string; error: string }>
  aggregation_status: 'complete' | 'partial' | 'failed'
}

export interface ExecutionScenarioCandidate {
  name?: string
  probability?: number
  utility?: number
}

export interface ExecutionScenarios {
  actor_id: string
  execution_id: string
  prediction_available: boolean
  reason?: string
  prediction_id?: string
  recommendation?: string
  confidence?: number
  candidates?: ExecutionScenarioCandidate[]
  scenario_participation?: ScenarioParticipation | null
}

// Mirrors GET .../narrative — composes the above plus real Timeline
// evidence (Intent/Plan/Execution) into one what/why/who/how response.
// society_coordination.available is honestly false for past executions
// (see the backend route's own docstring) rather than a fabricated value.
export interface ExecutionNarrative {
  actor_id: string
  execution_id: string
  what_happened: string
  why: string
  who_did_what: { actor: string; capabilities_used: string[]; colleagues_involved: string[] }
  how: { pipeline_stages: string[]; intent: Record<string, unknown> | null; plan: Record<string, unknown> | null }
  conversation: ExecutionConversation
  negotiation: ExecutionNegotiation
  society_coordination: { available: boolean; reason: string }
  world_changes: string[]
  learning: { learned: boolean; duration_ms?: number | null }
  generation_latency_ms: number
}

export function fetchExecutionConversation(actorId: string, executionId: string): Promise<ExecutionConversation> {
  return apiClient.request<ExecutionConversation>(`/actors/${actorId}/executions/${executionId}/conversation`)
}

export function fetchExecutionNegotiation(actorId: string, executionId: string): Promise<ExecutionNegotiation> {
  return apiClient.request<ExecutionNegotiation>(`/actors/${actorId}/executions/${executionId}/negotiation`)
}

export function fetchExecutionGameTheory(actorId: string, executionId: string): Promise<ExecutionGameTheory> {
  return apiClient.request<ExecutionGameTheory>(`/actors/${actorId}/executions/${executionId}/game-theory`)
}

export function fetchExecutionScenarios(actorId: string, executionId: string): Promise<ExecutionScenarios> {
  return apiClient.request<ExecutionScenarios>(`/actors/${actorId}/executions/${executionId}/scenarios`)
}

export function fetchExecutionNarrative(actorId: string, executionId: string): Promise<ExecutionNarrative> {
  return apiClient.request<ExecutionNarrative>(`/actors/${actorId}/executions/${executionId}/narrative`)
}
