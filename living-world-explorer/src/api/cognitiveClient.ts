import { apiClient } from './client'

// Mirrors kernel/timeline/entry.py's TimelineEntry base — every
// Intent/Goal/Belief/Plan/Decision/Execution record shares these.
interface TimelineEntryBase {
  entry_id: string
  actor_id: string
  start_time: number
  end_time: number | null
  confidence: number
  source: string
  metadata: Record<string, unknown>
}

export interface IntentRecord extends TimelineEntryBase {
  intent_type: string
  entities: string[]
  constraints: string[]
  priority: number
}

export interface GoalRecord extends TimelineEntryBase {
  name: string
  description: string
  success_criteria: string[]
  optimization_objective: string
  priority: number
  status: string
}

export interface BeliefRecord extends TimelineEntryBase {
  subject: string
  predicate: string
  value: unknown
  // metadata carries: evidence (string[]), evidence_count (number),
  // previous_value (unknown), reason (string) — see belief.py.
}

export interface PlanRecord extends TimelineEntryBase {
  plan_id: string
  goal: string
  // Capability/action names (Level 3 — runtime execution mechanism,
  // e.g. "EvaluateStrategy"). Implementation detail — belongs in the
  // Execution Graph, not a user-facing plan.
  steps: string[]
  // Same order as steps — the planner's own plain-business-language
  // description of each step (Level 2 — the domain plan, e.g. "Check
  // if the product is in stock"). This is what the Actor Inspector
  // should show as "what the actor intends to do."
  step_descriptions: string[]
  node_count: number
  completed_nodes: number
  cost: number
  risk: number
  status: string
  result: string
  // Plan hysteresis (kernel/pipeline/planning/current_plan_store.py::
  // CurrentPlanRecord) — present only when this PlanRecord-shaped object
  // is actually the actor's real persisted Current Plan, not a plain
  // Timeline PlanRecord. status "current" means "the standing plan";
  // "superseded" means a Current Plan that has since been replaced.
  score?: number
  score_components?: { probability: number; expected_utility: number; cost: number; risk: number; score: number }
  created_at?: number
  age_seconds?: number
  kept_count?: number
  last_kept_at?: number | null
  replaced_plan_id?: string | null
}

export interface DecisionRecord extends TimelineEntryBase {
  selected_strategy: string
  reason: string
  utility: number
  evidence: string[]
  candidates: Array<{ name?: string; utility?: number; plan_id?: string; attributes?: Record<string, unknown> } & Record<string, unknown>>
}

export interface ExecutionHistoryEntry extends TimelineEntryBase {
  goal: string
  plan_summary: string[]
  outcome: string
  failure_reason: string
  // Every failed step, each "{action}: {error}" — failure_reason alone
  // only ever carried the first one, silently dropping the rest for a
  // partial outcome. See kernel/timeline/entry.py::ExecutionRecord.
  step_failures?: string[]
  capabilities_used: string[]
  // metadata carries duration_ms, world_changes (string[]), and
  // execution_id (Planetary Narrative correlation key — see
  // narrativeClient.ts) — see belief_runtime.py::_record_execution.
  reward?: number
  actor_loss?: number
  actions_executed?: number
}

export interface SemanticMemoryItem {
  subject: string
  hypotheses: Array<{ subject: string; predicate: string; object_value: unknown; confidence: number; sources: string[] }>
  last_observation_time: number
  staleness: number
}

export interface EpisodicMemoryItem {
  node_id: string
  kind: string
  text: string
  timestamp: number
  metadata: Record<string, unknown>
}

export interface ConversationMemoryItem {
  event_id?: string
  event_type?: string
  actor_id?: string
  description?: string
  payload?: unknown
  timestamp?: number
  provenance?: string
}

export interface ActorAffiliationSummary {
  affiliation_id: string
  affiliation_type: string
  target_id: string
  target_name: string
  trust_level: number
  category: string | null
}

export interface PresenceRecord extends TimelineEntryBase {
  space_id: string
  activity: string
}

// Derived from real PlanRecords, grouped by canonical (normalized) goal
// name — see actors.py::_goal_executions. A goal is persistent; each
// individual real request against it is an execution.
export interface GoalExecutionGroup {
  goal: string
  executions: Array<{ requested: string; outcome: string; timestamp: number; result: string }>
}

// Mirrors GET /actors/{id}/cognitive-state — the sprint's own "New Actor
// State Model" document structure in one response (see gateway_models.py
// ::ActorCognitiveStateResponse). Every section is real and independently
// nullable/empty — an actor with no Decision yet made no negotiation,
// not a fetch failure.
export interface ActorCognitiveState {
  actor_id: string
  identity: {
    actor_id: string; name: string; actor_type: string; description: string
    status: string; is_active: boolean; cycle_count: number
  }
  presence: PresenceRecord | null
  affiliations: ActorAffiliationSummary[]
  current_society: { society_id: string; name: string } | null
  intent: IntentRecord | null
  goals: GoalRecord[]
  goal_history: GoalRecord[]
  goal_executions: GoalExecutionGroup[]
  beliefs: BeliefRecord[]
  current_plan: PlanRecord | null
  plan_history: PlanRecord[]
  decision: DecisionRecord | null
  decision_history: DecisionRecord[]
  // Plan hysteresis: the most recent "keep vs replace" verdict
  // specifically (metadata.decision_kind === "plan_hysteresis"),
  // additive to `decision` above which stays "most recent of any kind."
  plan_decision: DecisionRecord | null
  memory_semantic: SemanticMemoryItem[]
  memory_episodic: EpisodicMemoryItem[]
  memory_conversation: ConversationMemoryItem[]
  execution_history: ExecutionHistoryEntry[]
}

export function fetchActorCognitiveState(actorId: string): Promise<ActorCognitiveState> {
  return apiClient.request<ActorCognitiveState>(`/actors/${actorId}/cognitive-state`)
}
