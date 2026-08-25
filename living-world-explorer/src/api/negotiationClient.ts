import { apiClient } from './client'

// POST /actors/{actor_id}/transactions — the real negotiation centerpiece
// (kernel/society/transaction.py::TransactionCoordinator + game_theory.py::
// GameTheoryRuntime). A live, LLM-driven, multi-round negotiation loop —
// NOT a mock/simulator. This mirrors gateway_models.py's TransactionRequest/
// TransactionResponse/TransactionStepResponse exactly; both are already
// clean Pydantic models with `trace`/`strategic_context` as untyped dicts
// server-side, so this stays untyped for those two fields rather than
// inventing a stronger shape the backend itself doesn't have.

export interface TransactionStepResponseDto {
  step_number: number
  target_actor_id: string
  message: string
  trace: Record<string, unknown> | null
  next_action: string
  next_action_reason: string
  strategic_context: Record<string, unknown> | null
  timestamp: number
}

export interface TransactionResponseDto {
  transaction_id: string
  originating_actor_id: string
  objective: string
  status: string
  steps: TransactionStepResponseDto[]
  societies_involved: string[]
  affiliates_contacted: string[]
  duration_ms: number
  final_outcome: string
  timestamp: number
  // Real, but NOT prefixed with /api/v1/agentos — build the actual WS URL
  // yourself (see useTransactionEvents.ts) rather than trusting this
  // verbatim as a fetchable path.
  stream_url: string
}

// A real multi-round LLM negotiation — this call is genuinely slow
// (observed 60-240s+ against the live dev backend, not a bug). The caller
// should show a generous "in progress" state, not a spinner sized for a
// normal API call. Live progress streams to useTransactionEvents(transaction_id)
// while this request is in flight, if the caller subscribes before/during
// the call.
export function startTransaction(actorId: string, objective: string, maxSteps = 8): Promise<TransactionResponseDto> {
  return apiClient.request<TransactionResponseDto>(`/actors/${actorId}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-ID': actorId },
    body: JSON.stringify({ objective, max_steps: maxSteps }),
  })
}

// Re-export the existing per-execution historical negotiation client —
// there is no "list all transactions" route (confirmed: none exists), so
// the historical view is composed from each actor's own Timeline-derived
// negotiation records, not a global transaction list.
export {
  fetchExecutionNegotiation, fetchExecutionGameTheory, fetchExecutionNarrative,
  type ExecutionNegotiation, type ExecutionGameTheory, type ExecutionNarrative,
} from './narrativeClient'
