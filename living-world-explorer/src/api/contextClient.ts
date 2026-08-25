import { apiClient } from './client'

// Mirrors kernel/pipeline/planning/domain.py::RetrievedItem — every
// grounded fact carries its own real provenance. The fields below
// `evidence_ids` are optional, additive extensions no real backend
// route populates yet — only the demo dataset (demoGroundingData.ts)
// sets them today. Every card that reads them falls back to omitting
// the enrichment rather than fabricating a value, so real API
// responses (which never carry these keys) render exactly as before.
export interface RetrievedItemDto {
  content: string
  item_type: string
  source: string
  confidence: number
  timestamp: number
  retrieval_score: number
  evidence_ids: string[]
  reason?: string
  influence?: number
  impact?: 'high' | 'medium' | 'low'
  previousState?: string
  newState?: string
  affectedEntities?: string[]
  affectedLocation?: string
  groundingImpact?: string
  planningImpact?: string
  planningCyclesAffected?: number
  outcome?: string
}

// Mirrors GET /actors/{id}/executions/{execution_id}/planning-context —
// kernel/pipeline/planning/context_snapshot_store.py::ContextSnapshot,
// the full real PlanningContext ContextConstructionEngine.build()
// produced for this tick, persisted verbatim.
export interface ContextSnapshotDto {
  execution_id: string
  actor_id: string
  created_at: number
  knowledge: RetrievedItemDto[]
  relationships: RetrievedItemDto[]
  context_events: RetrievedItemDto[]
  experiences: RetrievedItemDto[]
  conversations: RetrievedItemDto[]
  executions: RetrievedItemDto[]
  relevant_locations: string[]
  relevant_objects: string[]
  available_capabilities: string[]
  affiliations: Array<Record<string, unknown>>
  available_resources: unknown[]
  world_state: Record<string, unknown>
  retrieval_sources: string[]
  retrieval_latency_ms: Record<string, number>
  planner_prompt: string
  prompt_tokens: number
  observed_facts: unknown[]
  final_planner_context: Record<string, unknown>
  summary: { entity_count: number; relationship_count: number; context_event_count: number; experience_count: number; semantic_memory_count?: number; episodic_memory_count?: number; affiliation_count?: number; location_count?: number; object_count?: number; world_object_count?: number }
  diff_from_previous: {
    is_first_context: boolean
    added: Record<string, string[]>
    removed: Record<string, string[]>
  } | null
}

export function fetchExecutionPlanningContext(actorId: string, executionId: string): Promise<ContextSnapshotDto> {
  return apiClient.request<ContextSnapshotDto>(`/actors/${actorId}/executions/${executionId}/planning-context`)
}

// External perturbations are just context_events with item_type ===
// "external_perturbation" (see ContextConstructionEngine._retrieve_context_stream)
// — no separate fetch needed once planning-context is loaded.
export function externalEventsFrom(snapshot: ContextSnapshotDto): RetrievedItemDto[] {
  return snapshot.context_events.filter((e) => e.item_type === 'external_perturbation')
}

// Real durable beliefs (observation_count >= 2) aren't part of the
// per-execution snapshot (they're current actor state, not scoped to one
// tick) — fetched separately via the existing /semantic-memory route,
// which also echoes back retrieved_this_execution for convenience.
// api/routes/actors.py::_grouped_beliefs already returns `source` and
// `start_time` (confirmed live) but the DTO never declared them —
// callers silently lost real provenance. `end_time` is real too
// (always null today; nothing in the codebase currently closes out a
// belief, but the field exists on the timeline record).
export interface DurableBeliefDto {
  subject: string
  value: unknown
  confidence: number
  source?: string
  start_time?: number
  end_time?: number | null
  metadata: Record<string, unknown>
}

export interface SemanticMemoryDto {
  actor_id: string
  execution_id: string
  retrieved_this_execution: { experiences: RetrievedItemDto[]; conversations: RetrievedItemDto[] }
  durable_beliefs: DurableBeliefDto[]
}

export function fetchExecutionSemanticMemory(actorId: string, executionId: string): Promise<SemanticMemoryDto> {
  return apiClient.request<SemanticMemoryDto>(`/actors/${actorId}/executions/${executionId}/semantic-memory`)
}

// No real route computes a causal trace yet — CausalStep stays
// demo-only for now (GroundingDebugger derives a real one client-side
// from context_events/diff instead; see deriveCausalChain).
export interface CausalStep {
  label: string
  detail: string
}

// GET /actors/{id}/affiliation-chain returns exactly this shape — a
// real traversal over kernel/affiliations (see
// _walk_affiliation_chain in api/routes/actors.py), not a fabricated
// graph. Whatever length the real graph actually supports; never
// padded.
export interface AffiliationChainNode {
  id: string
  name: string
  entityType: string
  edgeLabel?: string
}

export function fetchActorAffiliationChain(actorId: string, maxDepth = 5): Promise<AffiliationChainNode[]> {
  return apiClient.request<{ actor_id: string; chain: AffiliationChainNode[] }>(`/actors/${actorId}/affiliation-chain?max_depth=${maxDepth}`)
    .then((r) => r.chain)
}

// GET /actors/{id}/executions/{execution_id}/conversation — the real
// AskActor/DelegateTask messages THIS execution actually exchanged
// (kernel/society/context_stream.py INTERACTION events), not the
// separate "conversations retrieved as grounding input" bucket
// SemanticMemoryDto.retrieved_this_execution.conversations carries
// (that one is captured BEFORE this tick's own actions run, so it can
// never contain this tick's own exchange — see get_execution_
// conversation's own docstring in api/routes/actors.py). Distinct data,
// distinct purpose: this is "what was said during this execution."
export interface ExecutionConversationMessageDto {
  event_id: string
  event_type: string
  actor_id: string
  description: string
  payload: {
    from_actor_id?: string
    from_actor_name?: string
    to_actor_id?: string
    to_actor_name?: string
    question?: string
    answer?: string
    [key: string]: unknown
  }
  timestamp: number
}

export function fetchExecutionConversation(actorId: string, executionId: string): Promise<ExecutionConversationMessageDto[]> {
  return apiClient
    .request<{ actor_id: string; execution_id: string; message_count: number; messages: ExecutionConversationMessageDto[] }>(
      `/actors/${actorId}/executions/${executionId}/conversation`,
    )
    .then((r) => r.messages)
}
