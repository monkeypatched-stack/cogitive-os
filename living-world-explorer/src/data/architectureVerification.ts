// Manually verified against source on 2026-08-10, by direct code reading —
// NOT computed at runtime. No self-check/introspection API exists in this
// codebase that could generate this table automatically; inventing one
// would itself be a fabrication this feature explicitly avoids. If any of
// these classifications change, this file must be updated by hand after a
// fresh source read, the same way it was produced.

export type ImplStatus = 'IMPLEMENTED_AND_WIRED' | 'PARTIAL' | 'IMPLEMENTED_BUT_UNUSED' | 'NOT_IMPLEMENTED'
export type Observability = 'REAL_COUNTER' | 'NOT_INSTRUMENTED'
// Free-text, prefixed with one of DURABLE/IN_MEMORY_ONLY/NONE/N/A for
// scanability, with a real qualifying detail appended where it matters
// (e.g. which store, which record) rather than forcing a bare enum that
// would lose that detail.
export type Persistence = string
// Free-text, prefixed with COVERED/GAP for scanability.
export type TestStatus = string

export interface VerificationRow {
  component: string
  implementationStatus: ImplStatus
  runtimePath: string
  wiring: string
  persistence: Persistence
  observability: Observability
  tests: TestStatus
  note?: string
}

export const COMMUNICATION_VERIFICATION: VerificationRow[] = [
  {
    component: 'AffiliationCommunicationRouter / AffiliationGraph',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'SocietyRuntime.send_message/broadcast_message -> AffiliationCommunicationRouter.resolve -> AffiliationGraph.can_communicate',
    wiring: 'GET /societies/{id}/communication-log (live, confirmed)',
    persistence: 'DURABLE',
    observability: 'REAL_COUNTER',
    tests: 'COVERED',
  },
  {
    component: 'SocietyRuntime message queue (belief-injection delivery)',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'SocietyRuntime.send_message -> _message_queue -> _deliver_messages (belief injection each tick)',
    wiring: 'No REST route exposes the queue itself',
    persistence: 'NONE',
    observability: 'NOT_INSTRUMENTED',
    tests: 'GAP',
    note: 'Queue is cleared every tick — no delivered/failed/pending counters exist anywhere.',
  },
  {
    component: 'AskActorCapability / subscribe_actor_inbox (NATS request/reply)',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'Real NATS point-to-point request/reply on monkeybrain.actor.{id}.inbox; in-process fallback when no NATS client',
    wiring: 'Invoked via planner-selected AskActor plan steps; not a direct REST route',
    persistence: 'via ContextStream INTERACTION event only',
    observability: 'NOT_INSTRUMENTED',
    tests: 'GAP',
    note: 'Real NATS transport path untested in this environment (no broker in CI) — only the in-process fallback is exercised.',
  },
  {
    component: 'SocietyContextStream',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'Real internal pub/sub, real subscribers, optional NATS mirror, Redis durability hook',
    wiring: 'GET /societies/{id}/context?event_type=INTERACTION (live, confirmed, already consumed by EventStreamPanel.tsx)',
    persistence: 'DURABLE',
    observability: 'NOT_INSTRUMENTED',
    tests: 'COVERED',
  },
  {
    component: 'InteractionManager (create/respond/vote/complete)',
    implementationStatus: 'PARTIAL',
    runtimePath: 'SocietyRuntime.route_interaction/respond_to_interaction/cast_vote/complete_interaction',
    wiring: 'POST /planet/interactions creates only; respond/vote/complete have no REST route (in-process only)',
    persistence: 'IN_MEMORY_ONLY',
    observability: 'NOT_INSTRUMENTED',
    tests: 'COVERED',
  },
  {
    component: 'TransactionEventHub (WS fan-out for negotiation rounds)',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'TransactionCoordinator._stream_event -> TransactionEventHub.publish + NATS + SocietyContextStream',
    wiring: 'WS /ws/transactions/{transaction_id} (live, real events)',
    persistence: 'live leg: NONE; context-stream leg: DURABLE',
    observability: 'NOT_INSTRUMENTED',
    tests: 'COVERED',
  },
  {
    component: 'kernel/execute/agents/bus.py::AgentBus',
    implementationStatus: 'IMPLEMENTED_BUT_UNUSED',
    runtimePath: 'Fully coded — register()/execute() — but zero callers anywhere in src/, packages/, or tests/',
    wiring: 'None',
    persistence: 'NONE',
    observability: 'NOT_INSTRUMENTED',
    tests: 'GAP',
    note: 'Do not build on this — it is not reachable from any live path.',
  },
  {
    component: 'cerebellum.capabilities.communication.* / event_streaming.*',
    implementationStatus: 'NOT_IMPLEMENTED',
    runtimePath: 'Real code exists (Slack/Discord/Telegram/Teams are genuine HTTP webhooks; Email/Kafka/RabbitMQ/NATS/RedisStreams are placeholder stubs) but none are registered with any capability bus',
    wiring: 'None — completely orphaned',
    persistence: 'NONE',
    observability: 'NOT_INSTRUMENTED',
    tests: 'GAP',
    note: 'Unregistered — not reachable by any agent or planner.',
  },
  {
    component: 'Unified correlation_id / causation_id',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'CommunicationDecision -> queued message dict -> BeliefHypothesis -> ContextEvent -> TimelineEntry, reusing execution_id/transaction_id as correlation_id where one already exists (kernel/society/communication.py, runtime.py, belief.py, context_stream.py, timeline/entry.py)',
    wiring: 'GET /societies/{id}/communication-log and GET /societies/{id}/context both now return correlation_id/causation_id per entry; rendered in this page\'s Message Stream table',
    persistence: 'DURABLE (TimelineEntry, ContextEvent) + IN_MEMORY (queued message dict, cleared each tick like the rest of that queue)',
    observability: 'NOT_INSTRUMENTED',
    tests: 'COVERED',
    note: 'Closed a real, previously-documented gap — see tests/unit/test_correlation_causation.py (11 properties) and the flipped assertion in tests/unit/test_communication_verification.py::TestNoCorrelationIdOnCommunicationDecision.',
  },
]

export const NEGOTIATION_VERIFICATION: VerificationRow[] = [
  {
    component: 'GameTheoryRuntime (utility evaluation + Nash-equilibrium gating)',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'Shared single instance across PlanetaryRuntime/every SocietyRuntime/create_society',
    wiring: 'Consulted every negotiation round via TransactionCoordinator._strategic_context',
    persistence: 'IN_MEMORY_ONLY (self._agreements dict)',
    observability: 'REAL_COUNTER',
    tests: 'COVERED',
    note: 'Confirmed live via GET /observability: game_theory.negotiations_completed, .utility_evaluations, .agreement counters all real and non-zero.',
  },
  {
    component: 'TransactionCoordinator + TerminalStateEvaluator + NegotiationPlanner',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'Real multi-round loop: trust-ranked affiliates, real cognitive ticks as offers/responses, deterministic terminal evaluation (LLM cannot self-terminate)',
    wiring: 'POST /actors/{actor_id}/transactions (live, confirmed) + WS /ws/transactions/{id}',
    persistence: 'DURABLE (outcome via TimelineKind.DECISION)',
    observability: 'REAL_COUNTER',
    tests: 'COVERED',
  },
  {
    component: 'CoordinationEngine (propose/counter_propose/accept/settle)',
    implementationStatus: 'IMPLEMENTED_BUT_UNUSED',
    runtimePath: 'Fully coded session model with real dataclasses; zero callers anywhere outside its own file',
    wiring: 'None — not reachable from any live path',
    persistence: 'IN_MEMORY_ONLY',
    observability: 'NOT_INSTRUMENTED',
    tests: 'GAP (marker-only)',
    note: 'Do not build the Negotiations UI around this class — it only looks like the obvious session model.',
  },
  {
    component: 'Grocery bilateral bargaining (negotiate_price/negotiate_terms/evaluate_candidates/record_agreement)',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'Real bounded multi-round split-the-difference bargain; registered in the live grocery capability bus; planner-prompted',
    wiring: 'Invoked via planner-selected NegotiatePrice/NegotiateTerms plan steps',
    persistence: 'DURABLE (record_agreement, CAS-append)',
    observability: 'NOT_INSTRUMENTED',
    tests: 'COVERED',
    note: 'Zero prior test coverage before this feature — closed by test_negotiation_verification.py.',
  },
  {
    component: 'Timeline representation (TimelineKind.DECISION + decision_kind=negotiation)',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: '_record_decision writes metadata.decision_kind=negotiation + execution_id + typed correlation_id/causation_id',
    wiring: 'GET /actors/{id}/executions/{id}/negotiation (live, real, already had a frontend client)',
    persistence: 'DURABLE',
    observability: 'NOT_INSTRUMENTED',
    tests: 'COVERED',
    note: 'No dedicated TimelineKind — piggybacked on DECISION. Real, not a second timeline. Correction as of the correlation/causation hardening pass: this path was previously only reachable via PlanetaryRuntime.execute_actor_request, NOT from TransactionCoordinator — real negotiations wrote zero DECISION entries. TransactionCoordinator.execute() now calls _record_decision too (transaction_id as execution_id/correlation_id), closing that gap.',
  },
  {
    component: 'Trust <-> negotiation ranking (AffiliationManager)',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'get_trust/update_trust_from_outcome, read/written every round by TransactionCoordinator',
    wiring: 'In-process only',
    persistence: 'DURABLE (Affiliation.trust_level)',
    observability: 'NOT_INSTRUMENTED',
    tests: 'COVERED',
  },
  {
    component: '"List all transactions" (session index)',
    implementationStatus: 'NOT_IMPLEMENTED',
    runtimePath: 'N/A',
    wiring: 'No route exists — only create (POST) and get-one-historical-by-execution (GET)',
    persistence: 'N/A',
    observability: 'NOT_INSTRUMENTED',
    tests: 'GAP',
    note: 'Real gap — this UI can only show sessions started in the current browser session (LIVE) plus Timeline-derived historical records (HISTORICAL), never a full server-side list.',
  },
]

// Manually verified against source on 2026-08-24, by direct code reading —
// NOT computed at runtime. No security self-check API exists in this
// codebase; SecurityPanel.tsx renders this table as-is via
// ArchitectureVerificationPanel rather than fabricating a live PASS board.
export const SECURITY_VERIFICATION: VerificationRow[] = [
  {
    component: 'Permission enforcement (require_permission)',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'api/dependencies.py::require_permission — decodes Bearer JWT, checks jti revocation, checks permission in token claim, falls back to DelegationRegistry',
    wiring: 'Every src/monkey_brain/api/ route depends on this or require_self_or_permission',
    persistence: 'N/A (stateless per-request check)',
    observability: 'REAL_COUNTER',
    tests: 'COVERED',
    note: 'AGENTOS_AUTH_REQUIRED controls enforcement; this dev deployment runs with it set false, so every check here passes open — see Identity tab.',
  },
  {
    component: 'Token revocation (jti blocklist)',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'services/auth/helpers/revocation.py::is_jti_revoked, checked inline in require_permission before the permission check',
    wiring: 'In-process, every Bearer-token request',
    persistence: 'DURABLE (Redis blocklist)',
    observability: 'NOT_INSTRUMENTED',
    tests: 'COVERED',
    note: 'No endpoint lists revoked tokens for an actor — Identity tab cannot show revocation history, only that the mechanism exists.',
  },
  {
    component: 'Delegated authority (DelegationRegistry + act-on-behalf-of)',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'kernel/society/delegation.py; api/dependencies.py::ACT_ON_BEHALF_PERMISSION + authorize_acting_for',
    wiring: 'GET/POST /memberships/{id}/delegations, DELETE /delegations/{id} (live, confirmed)',
    persistence: 'DURABLE',
    observability: 'NOT_INSTRUMENTED',
    tests: 'COVERED',
    note: 'Listable only per-membership — no "all delegations" endpoint. Delegations tab lists every active membership\'s delegations, not a global table.',
  },
  {
    component: 'Human approval gate ("Consent")',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'kernel/pipeline/approval_store.py (WAITING_FOR_HUMAN state) + action_executor.py gate',
    wiring: 'GET /executions/{id}/pending-approval, POST /executions/{id}/approve',
    persistence: 'DURABLE (Redis, survives restart)',
    observability: 'NOT_INSTRUMENTED',
    tests: 'COVERED',
    note: 'Single-execution lookup only — no list-all-pending endpoint (no scan_iter/keys() in approval_store.py). Execution Trace tab needs a known execution_id.',
  },
  {
    component: 'TransitionGate counterparty negotiation',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'kernel/pipeline/negotiation_store.py + action_executor.py gate; distinct from the game-theoretic Strategy Negotiation below',
    wiring: 'GET /executions/{id}/pending-negotiation, POST /executions/{id}/negotiate',
    persistence: 'DURABLE (Redis, survives restart)',
    observability: 'NOT_INSTRUMENTED',
    tests: 'COVERED',
    note: 'Single-execution lookup only, same gap as Consent above. This session added: the proposal and the decision now also publish as real Conversations-panel messages (action_executor.py negotiation-gate publish, routes/negotiation.py decision publish).',
  },
  {
    component: 'Policy Decisions / TransitionGate audit trail',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'kernel/pipeline/audit_trail.py::record_decision_event, called with selected_strategy in {transition_gate_decision, idempotency_replay, idempotency_conflict, payment_completed}',
    wiring: 'GET /actors/{id}/executions/{id}/audit-timeline (per-execution) and GET /actors/{id}/cognitive-state -> decision_history (actor-wide)',
    persistence: 'DURABLE (TimelineStore, Redis-backed)',
    observability: 'REAL_COUNTER',
    tests: 'COVERED',
    note: 'No global cross-actor feed — every Policy Decision / TransitionGate view in this console is scoped to one actor.',
  },
  {
    component: 'Security violation detection',
    implementationStatus: 'IMPLEMENTED_AND_WIRED',
    runtimePath: 'api/dependencies.py::_audit_auth_failure / _record_failure_and_check_pattern — 5+ denied auth attempts by one subject in 60s logs security.suspicious_pattern; every denial (not just bursts) now also calls kernel/pipeline/violation_store.py::record_violation',
    wiring: 'GET /security/violations (api/routes/security.py) — reads the persisted store; Violations tab renders it live',
    persistence: 'DURABLE (Redis-backed capped list, kernel/pipeline/violation_store.py — same lazy-singleton shape as approval_store.py)',
    observability: 'REAL_COUNTER',
    tests: 'GAP — added 2026-08-24, no dedicated test file yet',
    note: 'Added 2026-08-24. Records every denial through require_permission/require_self_or_permission, flagging the subset that also crossed the 5-in-60s burst threshold. Not a general intrusion-detection system — only denials at this codebase\'s own authorization chokepoints produce a record.',
  },
]
