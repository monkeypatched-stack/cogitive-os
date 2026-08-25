import { apiClient, ApiError } from './client'

// Every function here wraps a REAL backend endpoint — see the file:line
// audit that shaped this client (routes/actors.py, routes/memberships.py,
// routes/policy.py, routes/negotiation.py, routes/approval.py). Nothing
// here computes an authorization/security decision client-side; every
// function returns exactly what the backend decided. Where the backend
// has no endpoint for something the Security console wants (a global
// list of pending negotiations/consents, a global delegation list, a
// persisted security-violations store), there is deliberately no
// function here — the UI must say so, not synthesize one.

// ── Identity & Authorization ────────────────────────────────────────
export function fetchEffectivePermissions(actorId: string): Promise<string[]> {
  return apiClient.request<string[]>(`/actors/${actorId}/effective-permissions`)
}

export interface EffectivePolicy { policy_id?: string; name?: string; [key: string]: unknown }
export function fetchEffectivePolicies(actorId: string): Promise<EffectivePolicy[]> {
  return apiClient.request<EffectivePolicy[]>(`/actors/${actorId}/effective-policies`)
}

export interface FraudStatus {
  actor_id?: string; high_risk?: boolean; risk_score?: number; reasons?: string[]
  velocity_cooldown_until?: number | null; [key: string]: unknown
}
export function fetchFraudStatus(actorId: string): Promise<FraudStatus> {
  return apiClient.request<FraudStatus>(`/actors/${actorId}/fraud-status`)
}

// GET /auth/principal — resolves whatever Bearer token THIS BROWSER SESSION
// sends (there is none in this dev deployment), not an arbitrary actor.
// Useful only as a live policy-engine connectivity check, not a per-actor
// authorization simulator — the UI must label it that way.
export interface PrincipalStatus { principal: Record<string, unknown> | null; authenticated: boolean }
export function fetchPrincipal(): Promise<PrincipalStatus> {
  return apiClient.request<PrincipalStatus>('/auth/principal')
}

export interface PolicyEvaluateResult { decision: Record<string, unknown>; reward?: number | null; fallback?: boolean }
export function evaluatePolicy(action: string, resource: string): Promise<PolicyEvaluateResult> {
  return apiClient.request<PolicyEvaluateResult>('/policy/evaluate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, resource }),
  })
}

export interface TrustDomain { [key: string]: unknown }
export function fetchTrustDomains(): Promise<{ trust_domains: TrustDomain[] }> {
  return apiClient.request('/policy/trust-domains')
}
export interface PolicyRole { [key: string]: unknown }
export function fetchPolicyRoles(): Promise<{ roles: PolicyRole[] }> {
  return apiClient.request('/policy/roles')
}

// ── Delegations — real, but only listable per-membership (see
// routes/memberships.py); there is no "all delegations" endpoint. ─────
export interface Delegation {
  delegation_id: string
  membership_id: string
  delegate_actor_id: string
  permissions: string[]
  valid_from: number
  valid_until: number | null
  constraints: Record<string, unknown>
  reason: string
  revoked: boolean
  revoked_at: number | null
}
export function fetchMembershipDelegations(membershipId: string): Promise<Delegation[]> {
  return apiClient.request<Delegation[]>(`/memberships/${membershipId}/delegations`)
}
export function revokeDelegation(delegationId: string): Promise<void> {
  return apiClient.request<void>(`/delegations/${delegationId}`, { method: 'DELETE' })
}

export function delegationStatus(d: Delegation, now = Date.now() / 1000): 'REVOKED' | 'EXPIRED' | 'PENDING' | 'ACTIVE' {
  if (d.revoked) return 'REVOKED'
  if (d.valid_until !== null && d.valid_until < now) return 'EXPIRED'
  if (d.valid_from > now) return 'PENDING'
  return 'ACTIVE'
}

// ── Consent (≈ human-in-the-loop Approval) & TransitionGate Negotiation
// — both real, both ONLY resolvable for an execution_id you already have
// (no list-all-pending endpoint exists in either store — confirmed no
// scan_iter/keys() usage in negotiation_store.py / approval_store.py). A
// 404 means "nothing pending for this execution", not an error. ───────
export interface PendingApproval {
  execution_id: string; actor_id: string; step_index: number; capability: string; action_id: string
  proposed_action: Record<string, unknown>; reason: string; correlation_id: string; causation_id: string
  created_at: number; decided: boolean | null; decided_at: number | null; original_question: string
}
export async function fetchPendingApproval(executionId: string): Promise<PendingApproval | null> {
  try { return await apiClient.request<PendingApproval>(`/executions/${executionId}/pending-approval`) }
  catch (err) { if (err instanceof ApiError && err.status === 404) return null; throw err }
}

export interface PendingNegotiation {
  execution_id: string; actor_id: string; step_index: number; capability: string; action_id: string
  proposed_transition: Record<string, unknown>; counterparties: string[]; reason: string
  correlation_id: string; causation_id: string; created_at: number; decided: boolean | null
  decided_at: number | null; original_question: string
}
export async function fetchPendingNegotiation(executionId: string): Promise<PendingNegotiation | null> {
  try { return await apiClient.request<PendingNegotiation>(`/executions/${executionId}/pending-negotiation`) }
  catch (err) { if (err instanceof ApiError && err.status === 404) return null; throw err }
}

// GET /actors/{id}/executions/{id}/negotiation — a DIFFERENT real concept
// from the TransitionGate pending-negotiation above: the game-theoretic
// strategy trace (EvaluateStrategy/CompeteForResource/NegotiatePrice/...),
// kernel/society/integration.py::_build_negotiation_trace. Keep the two
// visually distinct — this is "Strategy Negotiation", not TransitionGate.
export interface StrategyNegotiation {
  actor_id: string; execution_id: string; negotiation_required: boolean; reason?: string
  candidate_strategies?: string[]; utility_evaluation?: Array<Record<string, unknown>>
  chosen_strategy?: string; negotiation_outcome?: unknown; is_competitive?: boolean
  is_cooperative?: boolean; agreement_recorded?: boolean; colleagues_involved?: string[]
}
export function fetchStrategyNegotiation(actorId: string, executionId: string): Promise<StrategyNegotiation> {
  return apiClient.request<StrategyNegotiation>(`/actors/${actorId}/executions/${executionId}/negotiation`)
}

// ── Audit / Policy Decisions / TransitionGate — all real, durable, and
// come from the SAME writer (kernel/pipeline/audit_trail.py -> Timeline
// Store DECISION/PLAN/EXECUTION kinds). "Policy Decisions" and
// "TransitionGate" below are both DERIVED views over this one source —
// there is no separate endpoint for either, and none is needed: every
// DECISION entry's selected_strategy is one of "transition_gate_decision"
// (real TransitionGate output — action_executor.py's gate check),
// "idempotency_replay" / "idempotency_conflict" (api/idempotency.py), or
// "payment_completed" (kernel/domains/grocery.py). ─────────────────────
export interface AuditTimelineEvent {
  kind: 'plan' | 'execution' | 'decision' | string
  actor_id?: string; correlation_id?: string; start_time?: number; end_time?: number | null
  selected_strategy?: string; reason?: string; evidence?: string[]; metadata?: Record<string, unknown>
  status?: string; goal?: string; outcome?: string
  [key: string]: unknown
}
export interface AuditTimeline {
  actor_id: string; execution_id: string; goal: string; outcome: string
  event_count: number; events: AuditTimelineEvent[]
}
export function fetchAuditTimeline(actorId: string, executionId: string): Promise<AuditTimeline> {
  return apiClient.request<AuditTimeline>(`/actors/${actorId}/executions/${executionId}/audit-timeline`)
}

export const TRANSITION_GATE_STRATEGY = 'transition_gate_decision'

// Real, persisted violation records (kernel/pipeline/violation_store.py,
// a Redis-backed list, same shape as approval_store.py). Previously
// api/dependencies.py::_audit_auth_failure's repeated-denial detector was
// fire-and-forget in-memory only; this store now records every denial
// (not just pattern-crossing bursts) and GET /security/violations reads
// it back — no more fabricated incident list needed.
export interface SecurityViolation {
  id: string; subject: string; permission: string; reason: string
  outcome: string; pattern_detected: boolean; recorded_at: number
}
export function fetchSecurityViolations(limit = 100, subject?: string): Promise<{ violations: SecurityViolation[]; count: number }> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (subject) params.set('subject', subject)
  return apiClient.request(`/security/violations?${params.toString()}`)
}

// Actor-wide decision history (no execution_id needed) — the same
// DECISION timeline kind, surfaced via GET /actors/{id}/cognitive-state's
// decision_history field (cognitiveClient.ts already types/fetches this;
// re-exported here only as the constant above, to keep one source of
// truth for the transition-gate strategy tag rather than a second one).
