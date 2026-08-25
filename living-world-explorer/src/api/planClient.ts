// Mirrors src/monkey_brain/kernel/models/plan.py::PlanResponse and
// kernel/models/execute.py::ExecuteResponse. POST /plan (kernel/api/routes/
// plan.py) synthesizes the real execution graph via the real planner and
// returns it — nothing is executed. POST /execute (routes/execute.py) is
// the only commit point, and its route signature is literally
// `payload: PlanResponse` — the caller re-POSTs the exact /plan response
// object, unmodified, to run it. This client does not construct a second
// planner or a second graph shape: it is a thin passthrough to those two
// real routes.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1/agentos'

export interface PlanGraphNodeDto {
  id: string
  name?: string
  agent?: string
  type?: string
  agents?: string[]
}

export interface PlanGraphEdgeDto {
  from: string
  to: string
  type?: string
}

export interface GoalEntityDto {
  name?: string
  type?: string
  attributes?: Record<string, unknown>
}

export interface GoalConstraintDto {
  type?: string
  description?: string
  parameters?: Record<string, unknown>
}

export interface GoalTreeNodeDto {
  id?: string
  text?: string
  priority?: string
  beneficiary?: string | null
  parent_id?: string | null
  condition?: string | null
  attributes?: Record<string, unknown>
}

export interface GoalIrDto {
  intent_type?: string
  domain?: string
  goal?: string
  entities?: GoalEntityDto[]
  constraints?: GoalConstraintDto[]
  relationships?: unknown[]
  goal_tree?: GoalTreeNodeDto[]
  metadata?: Record<string, unknown>
}

export interface CanonicalGraphDto {
  graph_id?: string
  graph_type?: string
  timestamp?: string | null
  nodes: PlanGraphNodeDto[]
  edges: PlanGraphEdgeDto[]
  execution_order?: string[][]
  annotations?: Record<string, unknown>
  state?: Record<string, unknown>
  total_steps?: number
  goal_ir?: GoalIrDto
  metadata?: Record<string, unknown>
}

export interface GroundingMetaDto {
  confidence: number
  threshold: number
  low_grounding: boolean
  remediation: string | null
}

export interface PlanResponseDto {
  graph: CanonicalGraphDto
  run_id: string
  target: 'execute' | 'simulate' | 'compare'
  question: string
  intent_ir: Record<string, unknown> | null
  elapsed_ms: number
  metadata: {
    profile?: Array<{ name: string; ms: number }>
    grounding?: GroundingMetaDto
    graph?: CanonicalGraphDto
    mesh_reuse?: unknown
  } | null
  workload_id: string
  answer: string
  grounding_confidence: number
  low_grounding: boolean
  user_id: string
  intent: { intent?: string; confidence?: number; workload_id?: string } | null
  // Remaining fields (graph_id/graph_type/timestamp/nodes/edges/execution_order/
  // annotations/state) duplicate `.graph`'s own fields at the top level — the
  // panel reads exclusively through `.graph` per that model's own "the graph
  // IS the response" docstring, so they're not separately typed here.
  [key: string]: unknown
}

export interface PlanValidationErrorDto {
  code: string
  message: string
}

export interface PlanErrorDto {
  error: string
  detail?: string | PlanValidationErrorDto[]
  attempts?: number
  errors?: PlanValidationErrorDto[]
  run_id?: string
  question?: string
  user_id?: string
  elapsed_ms?: number
  grounding_confidence?: number
  low_grounding?: boolean
  metadata?: Record<string, unknown>
}

export class PlanApiError extends Error {
  status: number
  body: PlanErrorDto

  constructor(status: number, body: PlanErrorDto) {
    super(body.error || `Request failed with status ${status}`)
    this.name = 'PlanApiError'
    this.status = status
    this.body = body
  }
}

// Does its own fetch (rather than the shared apiClient.request in
// client.ts) because /plan and /execute return a structured JSON error
// body on 4xx (validation error codes/messages, or "missing intent_ir")
// that the UI needs to show honestly — apiClient.request discards the
// response body on a non-2xx and throws a generic message-only error.
async function postPlanRoute<T>(path: string, actorId: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-ID': actorId },
    body: JSON.stringify(body),
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  if (!res.ok) {
    const errorBody: PlanErrorDto = (json && typeof json === 'object')
      ? (json as PlanErrorDto)
      : { error: `${path} -> ${res.status}` }
    throw new PlanApiError(res.status, errorBody)
  }
  return json as T
}

// POST /plan — real planner, real world-aware planning, real ExecutionGraph.
// Always target:"execute" (the /plan+/execute pair this analyzer sits
// between); "simulate"/"compare" address different runtimes, out of scope.
export function callPlan(actorId: string, question: string): Promise<PlanResponseDto> {
  return postPlanRoute<PlanResponseDto>('/plan', actorId, { question, target: 'execute' })
}

// POST /execute — the one real commit point. `plan` is re-posted verbatim:
// the server's route signature for /execute is literally `payload: PlanResponse`.
export function callExecute(actorId: string, plan: PlanResponseDto): Promise<Record<string, unknown>> {
  return postPlanRoute<Record<string, unknown>>('/execute', actorId, plan)
}
