import { apiClient } from './client'

// GET /learn/executions/{execution_id} — real, per-action learning
// events this execution actually produced: the policy's belief BEFORE
// this execution (`previous`) vs AFTER (`updated`), plus the real world
// delta that shifted it. This is the closest real predicted-vs-actual
// signal available per execution — there is no separate durable
// Comparator record (ComparatorRuntime's /compare/history exposes only
// the single most recent in-memory comparison, not filterable by
// execution_id — see SecurityPanel/GroundingDebugger's own gap notes).
export interface LearningPolicyState {
  action: string; description: string; kind: string; probability: number
  resulting_world_delta: Record<string, number>; confidence: number; grounding_fact_key: string
}
export interface LearningEvent {
  execution_id: string; actor_id: string; goal_key: string; action_key: string; success: boolean
  // previous is genuinely null on a cold-start action — the first time
  // THIS (goal_key, action_key) pair is ever learned, there is no prior
  // transition to reference (kernel/pipeline/comparison/integration.py::
  // _learn_transitions: `previous = previous_tuple[-1].to_dict() if
  // previous_tuple else None`). Real, expected shape — not a gap.
  previous: LearningPolicyState | null; updated: LearningPolicyState; recorded_at: number
}
export function fetchExecutionLearning(executionId: string): Promise<{ events: LearningEvent[] }> {
  return apiClient.request<{ events: LearningEvent[] }>(`/learn/executions/${executionId}`)
}
