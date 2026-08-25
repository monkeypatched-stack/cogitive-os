import { apiClient } from './client'

// Mirrors kernel/models/prompt.py::PromptResponse / api/routes/prompt.py.
// "answer" is a real templated confirmation ("<question> executed
// through the planetary cycle[ successfully]"), NOT an LLM chat reply —
// /prompt's actual job is "execute one prompt as the requesting actor's
// next planetary tick" (its own docstring), so the real payload worth
// showing is actor_execution (the real actions/outcome that tick
// produced), not a conversational answer that was never generated.
export interface PromptActorExecution {
  actions?: Array<{ action_id?: string; success?: boolean; result?: unknown }>
  actual_outcome?: { goal_achieved?: boolean; success_count?: number; failure_count?: number; actions_executed?: number }
}

export interface PromptQueryResult {
  question: string
  answer: string
  llm_answered: boolean
  actor_id?: string
  actor_execution?: PromptActorExecution
}

export interface PromptResponse {
  question: string
  query_result: PromptQueryResult | null
  error_lines: string[]
}

// POST /prompt — authenticates AS actorId via the dev-mode X-User-ID
// header (AGENTOS_AUTH_REQUIRED=false in this environment), since
// PlanetaryRuntime.execute_actor_request ticks whichever identity
// authenticated the request. run_simulate:false skips the separate
// SimulationRuntime path this chat feature doesn't need.
export function sendActorPrompt(actorId: string, question: string): Promise<PromptResponse> {
  return apiClient.request<PromptResponse>('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-ID': actorId },
    body: JSON.stringify({ question, run_simulate: false }),
  })
}

// POST /actors/{id}/goals — queues a real, persistent goal via the
// actor's own CognitiveActor.add_goal() (kernel/compile/cognitive_actor.py),
// distinct from /prompt's question, which is only a one-tick triggering
// event and is never remembered afterward. A goal added here survives
// across ticks (and a server restart, since it's persisted to the
// actor's profile) until the actor completes or replaces it.
export interface AddGoalResponse {
  actor_id: string
  goals: string[]
}

// `replaceGoal`: the exact previously-persisted goal text to remove
// first (server-side, via CognitiveActor._complete_goal — the same real
// removal a completed goal already uses) — so refining and re-creating
// a goal replaces the old queued entry instead of leaving near-duplicates.
export function addActorGoal(actorId: string, goal: string, replaceGoal?: string): Promise<AddGoalResponse> {
  return apiClient.request<AddGoalResponse>(`/actors/${actorId}/goals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal, replace_goal: replaceGoal ?? null }),
  })
}

// POST /actors/{id}/chat — a direct question to the actor, answered by a
// real LLM call grounded in whichever real source actually has
// something (this actor's own KG facts, then Tavily web search, then a
// plain ungrounded answer as the last resort) — never a template, never
// a fabricated fact. See api/routes/actors.py::actor_chat for the exact
// three-tier order.
export interface ChatWebResult {
  title: string
  url: string
}

export interface ActorChatResponse {
  answer: string
  source: 'knowledge_graph' | 'web_search' | 'general_knowledge'
  facts_used: string[]
  web_results: ChatWebResult[]
}

export function chatWithActor(actorId: string, message: string): Promise<ActorChatResponse> {
  return apiClient.request<ActorChatResponse>(`/actors/${actorId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}

// A real, minimal heuristic (question words / trailing "?") — never a
// guess dressed up as certainty. False negatives just mean a genuine
// question gets treated as a goal (queued harmlessly, still answerable
// on its next tick); false positives mean a goal-shaped message gets
// answered instead of queued — the user can always just ask again more
// directly. No ML classifier, no server round-trip, to keep routing
// instant.
const QUESTION_WORDS = ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'is', 'are', 'does', 'do', 'can', 'could', 'should', 'would', 'will']
export function looksLikeQuestion(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed.endsWith('?')) return true
  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() ?? ''
  return QUESTION_WORDS.includes(firstWord)
}
