import { apiClient } from './client'
import type { ContextSnapshotDto, SemanticMemoryDto, CausalStep, AffiliationChainNode } from './contextClient'

export type ExecutionChatRole = 'user' | 'assistant'

export interface ExecutionChatMessage {
  role: ExecutionChatRole
  content: string
  evidence?: ExecutionChatEvidence[]
}

export interface ExecutionChatEvidence {
  type: 'knowledge' | 'relationship' | 'experience' | 'conversation' | 'execution' | 'context_event' | 'belief' | 'affiliation' | 'world_state' | string
  label: string
  ref: string
}

// Exactly the shape POST /actors/{id}/executions/{id}/chat expects for
// `context` — mirrors GroundingDebugger's own props 1:1 so the request
// body IS the debugger's real data, never a second reconstruction of it.
export interface ExecutionChatContext {
  knowledge: ContextSnapshotDto['knowledge']
  relationships: ContextSnapshotDto['relationships']
  context_events: ContextSnapshotDto['context_events']
  experiences: ContextSnapshotDto['experiences']
  conversations: ContextSnapshotDto['conversations']
  executions: ContextSnapshotDto['executions']
  relevant_locations: string[]
  relevant_objects: string[]
  durable_beliefs: SemanticMemoryDto['durable_beliefs']
  affiliation_chain?: AffiliationChainNode[]
  diff_from_previous: ContextSnapshotDto['diff_from_previous']
  causal_chain?: CausalStep[]
}

export interface ExecutionChatRequest {
  execution_id: string
  actor_id: string
  actor_name: string
  goal: string
  status: string
  question: string
  history: ExecutionChatMessage[]
  selected_context?: string | null
  context: ExecutionChatContext
}

export interface ExecutionChatResponse {
  answer: string
  evidence: ExecutionChatEvidence[]
}

export function fetchExecutionChatReply(actorId: string, executionId: string, body: ExecutionChatRequest): Promise<ExecutionChatResponse> {
  return apiClient.request<ExecutionChatResponse>(`/actors/${actorId}/executions/${executionId}/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

// ── Goal mode — POST /actors/{id}/goal-draft ────────────────────────────
// A conversational, structured goal DRAFT — never persisted by itself.
// Only fetchCreateOrUpdateGoal (below, reusing the already-real
// promptClient.ts::addActorGoal) turns a finished draft into a real,
// queued CognitiveOS goal.
export interface GoalDraft {
  objective: string
  actor: string
  constraints: string[]
  preferences: string[]
  success_conditions: string[]
}

export interface GoalDraftResponse {
  draft: GoalDraft
  update_summary: string
}

export function fetchGoalDraft(actorId: string, message: string, currentDraft: GoalDraft | null): Promise<GoalDraftResponse> {
  return apiClient.request<GoalDraftResponse>(`/actors/${actorId}/goal-draft`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, current_draft: currentDraft }),
  })
}

// ── Web Search mode — POST /actors/{id}/web-search-chat ─────────────────
// Explicitly external/current information — Tavily results + one real
// summarization call, never CognitiveOS's own KG/memory (that's LLM/RAG
// mode). See api/routes/actors.py::web_search_chat.
export interface WebSearchSource {
  title: string
  url: string
}

export interface WebSearchChatResponse {
  answer: string
  sources: WebSearchSource[]
}

export function fetchWebSearchChat(actorId: string, query: string): Promise<WebSearchChatResponse> {
  return apiClient.request<WebSearchChatResponse>(`/actors/${actorId}/web-search-chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
}
