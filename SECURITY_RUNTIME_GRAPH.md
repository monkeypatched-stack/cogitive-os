# CognitiveOS Security Runtime Graph

Traces the ACTUAL code path for a protected action, stage by stage, against
the Doot/Agent One whitepaper's trust-infrastructure model (identity →
consent → policy → tool execution → authorization → audit). Runtime
enforcement only — a class or file existing does not count as a stage
being real. Evidence gathered by direct code reading + running the
relevant existing test suites (no tests modified).

Legend: **IMPLEMENTED** (real, pre-mutation, tested) · **PARTIAL** (real
but incomplete/opt-in/fail-open in some case) · **BYPASSED** (a live path
skips this stage) · **MISSING** (no such stage exists at all).

---

## Stage 1 — Actor Intent

- **File/Function**: `src/monkey_brain/kernel/pipeline/action_executor.py::ActionExecutor.execute()`
- **Caller**: an actor's cognitive tick (`CognitiveOS.tick()` →
  `kernel/cognitive_os/cognitive_os.py`) or a direct route handler.
- **Actor ownership**: the executing actor's own `ActionExecutor` instance,
  constructed per-actor via `VerticalRuntime` (`kernel/domains/vertical_router.py`).
- **Status**: **IMPLEMENTED** as the one real production mutation path —
  *except* for the bypasses documented at Stage 8 (`orders.py`,
  `SocialSourcingCapability`), which reach a capability's `.handle()`
  without going through this executor's gate logic at all, or go through
  it but hit an unrecognized action name.

## Stage 2 — Identity

- **File/Function**: `src/monkey_brain/api/dependencies.py` —
  `require_permission()` (:158-227), `require_self_or_permission()`
  (:230-321); JWT decode in
  `domains/manufacturing/knowledge/services/auth/helpers/tokens.py::decode_access_token`.
- **Caller**: FastAPI `Depends()` on every protected route, resolved
  before the route body runs.
- **Security decision**: with `AGENTOS_AUTH_REQUIRED=true` (prod default,
  `deploy/k8s/configmap.yaml:15`), the caller identity comes from a
  cryptographically verified Bearer JWT's `sub` claim — a real
  authenticated principal. Without enforced auth (local dev default,
  `scripts/start_server.sh:9`, explicitly banner-logged as
  "DISABLED (development mode only)"), `actor_id`/`X-User-ID` is a
  self-reported string.
- **Status**: **IMPLEMENTED** in the enforced-auth path.
  `actor_id` **provides identity metadata but does not constitute
  authenticated authorization** on its own — the code itself only trusts
  it once it's been validated by the JWT layer.

## Stage 3 — Delegation

- **File/Function**: `src/monkey_brain/kernel/society/delegation.py` —
  `Delegation`, `DelegationRegistry.grant/revoke/is_valid/effective_delegated_permissions`.
- **Caller of the data model**: `kernel/society/integration.py:328-329,1600-1601`
  (grant/revoke wiring), and `check_delegation()` called live from two
  specific capability sites (`kernel/domains/grocery.py:3905,6957`).
- **Caller of `effective_delegated_permissions()`**: `src/monkey_brain/api/
  dependencies.py::_effective_delegated_permissions()` (:232-263), consulted
  from both `require_permission` (:326) and `require_self_or_permission`
  (:459) — the one general authorization chokepoint every human-JWT route
  goes through. **Doot audit P1-4 fix** (re-verified 2026-08-25 against
  current code — this stage was PARTIAL when this document was first
  written; it no longer is).
- **Status**: **IMPLEMENTED**. A real, scoped/expiring/revocable
  delegation model exists, is durably grant/revoke-audited, and is now
  consulted as an additive widening check at the general authorization
  chokepoint (only reached when the base JWT permission has already
  failed; never raises on its own lookup failure) — not a second
  authorization model bolted on beside the JWT one.

## Stage 4 — Authorization

- **File/Function**: same `require_permission`/`require_self_or_permission`
  as Stage 2, using the JWT's `permissions` claim (not client-supplied).
- **Security decision**: raises `HTTPException` (401/403) inside a
  `Depends()` — structurally runs and can short-circuit before the route
  body, and therefore before any capability call.
- **Status**: **IMPLEMENTED** for API-layer routes with correct
  fail-before-mutation ordering, including at the resource-scoping level.
  The 6 routes previously flagged here as coarse-only (`goals_timeline`,
  `beliefs_timeline`, `executions/{id}/conversation`,
  `executions/{id}/semantic-memory`, `cognitive-state` in
  `api/routes/actors.py`; `GET /societies/{id}/beliefs` in
  `societies.py`) now all use `require_self_or_permission`, matching
  their hardened siblings — **Doot audit BYPASS-03 fix** (re-verified
  2026-08-25 against current code: `actors.py:1066,1081,1222,1608,1899`,
  `societies.py:501`'s own docstring names this exact fix).

## Stage 5 — Policy (OPA)

**Correction (2026-08-25)**: this stage's own file path
(`domains/manufacturing/knowledge/services/common/opa.py`) previously led
this document to treat OPA as an unrelated manufacturing-domain package.
It is not — `src/monkey_brain/api/main.py:46-48` deliberately inserts
`domains/manufacturing/knowledge` onto `sys.path` at CognitiveOS boot
specifically so `services.*` (this OPA client, `services.auth.helpers.*`,
`services.common.audit_events`) resolves; it is real, load-bearing
CognitiveOS-core infrastructure, just physically colocated under a
confusingly-named directory. Re-verified in full.

Three independent, real call sites, all converging on the same
`services.common.opa` client (a thin re-export of
`cerebellum.capabilities.security.opa_client` when that package is
importable, which it is in this environment — same client either way):

| Call site | Policy | Gates |
|---|---|---|
| `kernel/governance.py::GovernanceEngine.evaluate()` — via `get_governance_engine()` (`api/routes/plan.py`, `query.py`, `predict.py:473`, `execute.py:537`) and via `api/dependencies.py::sanitize_and_check_governance()` (`execute.py:221,714`, `predict.py:128,312`) | `opa/policies/agentos_governance.rego` | `/plan`, `/execute`, `/predict`, `/simulate`, `/compare`, `/query` — the human question/execution flow |
| `api/routes/actors.py` (9+ routes) — `require_opa("agentos/routes/allow", ...)` imported directly from `services.common.opa` | `opa/policies/agent_routes.rego` | Actor management routes (list/register/get/manage/view/execute) — but only for callers whose Bearer token resolves to an `agent`-type principal; human/`X-User-ID` callers pass through by the rego policy's own `allow if principal_type != "agent"` rule, never touching OPA at all |
| `kernel/plan/goals/executor.py::GoalExecutor._authorize()` — calls `evaluate("agentos/execute/allow", ..., default_allow=False)` | `opa/policies/agentos_execute.rego` | Goal execution, the layer closest to real mutation — deliberately `default_allow=False` (fails closed even when OPA is simply unconfigured), stricter than the other two call sites' `default_allow=True` |

- **Status**: **IMPLEMENTED**, not PARTIAL. This document previously
  found "fails open... OPA unreachable or erroring → falls back to
  default_allow=True" — **stale**, same as Stages 3/4/12: **Doot audit
  P1-6 fix** (re-verified 2026-08-25, confirmed in both the primary
  `cerebellum` implementation and the `services/common/opa.py` inline
  fallback used when `cerebellum` isn't importable): `OPA_URL` unset
  still uses `default_allow` (an explicit "no policy layer configured"
  deployment choice, not a failure); but `OPA_URL` **configured and
  then erroring/timing out/non-200** now fails **CLOSED**
  (`error_fallback = default_allow if not fail_closed_on_error else
  False`, `fail_closed_on_error=True` by default) — a misconfigured-but-
  reachable-URL OPA denies, it does not silently allow. Matches
  `tests/security/test_opa_fail_closed.py`'s own asserted behavior.
  `GoalExecutor._authorize`'s `agentos_execute.rego` gate is stricter
  still (`default_allow=False`), and is a THIRD, independent chokepoint
  this document had not previously traced at all — closest to the real
  mutation, not just the API edge. A dead policy file, `pipeline_guardrail.rego`
  (package `pipeline.guardrail`), was also found — zero callers anywhere,
  by filename or package path.

## Stage 6 — Consent

- **File/Function**: `src/monkey_brain/kernel/society/transition_gate.py::TransitionGate.evaluate()`
  — reads a resource's `requires_consent_from` attribute.
- **Caller**: `action_executor.py:250-298`, before `_execute_action`.
- **Status**: **PARTIAL**. This is genuine, enforced, pre-mutation consent
  for the specific resources that declare `requires_consent_from` — no
  boolean flag, execution actually pauses (`PendingNegotiation`) until a
  decision resolves it. But it is opt-in per-resource: no default
  seed/bootstrap path sets this attribute, and no protected action
  outside the Order/Payment vertical checks for it at all — see Stage 8's
  bypasses, where consent is reduced to a stale, non-live, owner-set flag
  (`for_sale`/`shareable`) instead of a per-transaction check.

## Stage 7 — Negotiation

- **File/Function**: `transition_gate.py` (decision) +
  `kernel/pipeline/negotiation_store.py::PendingNegotiation` (pause/resume
  state) + `api/routes/negotiation.py` (`POST /executions/{id}/negotiate`).
- **Caller chain**: `action_executor.py:250-319` builds a paused
  `gated_outcome` and `continue`s (never reaches `_execute_action`) on
  `requires_negotiation=True` with no decision yet; on
  `negotiation_decision is False`, likewise `continue`s — **rejected
  negotiation cannot commit**, verified structurally, not just by
  convention.
- **Status**: **IMPLEMENTED** for Order/Payment, with a real
  instrumented ordering proof: `test_transition_gate.py::test_gate007`
  asserts `proposal_created < negotiation_started < negotiation_completed
  < state_commit` on real timestamps. 15/15 gate tests + 28/28 broader
  negotiation-suite tests pass (`test_shared_budget.py`,
  `test_negotiated_purchase.py`, `test_negotiation_verification.py`,
  `test_transaction_coordinator.py`, `test_parse_budget_negotiation_collision.py`).
  **BYPASSED** outside that one vertical — see Stage 8.

## Stage 8 — TransitionGate / World Mutation Coverage

Every found path that mutates shared/cross-actor state, and whether it's
gated:

| Path | Gated? | Evidence |
|---|---|---|
| `OrderCreationCapability.handle()` → `try_reserve` | **IMPLEMENTED** | `grocery.py:6573,6790,6809`; `_propose_transition` `grocery.py:172-227` |
| `PaymentCapability.handle()` → `confirm_reservation` | **IMPLEMENTED** | `grocery.py:7259,7268` |
| `POST /orders`, `POST /orders/{id}/payment` (`api/routes/orders.py`) | **BYPASSED** | `orders.py:74,123` call `.handle()` directly, never through `ActionExecutor.execute()`. Self-documented in the file's own docstring (`orders.py:7-16`) as a "KNOWN, INTENTIONAL BYPASS" for admin/benchmark use, gated only by `perm-manage-actors`. `body.actor_id` is caller-supplied and never checked against the authenticated `user_id` — an admin-permissioned caller can force a payment for **any** actor_id, no negotiation. |
| `SocialSourcingCapability.handle()` → `borrow_item()` | **BYPASSED** | `grocery.py:4356` → `grocery.py:2784`. Ordinary actor-execution path (no special permission). `_propose_transition` (`grocery.py:191`) does not recognize `"SocialSourcing"` — returns `None`, gate never invoked. Mutates a *different* actor's owned entity (their loan list). |
| `SocialSourcingCapability.handle()` → `buy_from_neighbor()` | **BYPASSED** | `grocery.py:4386` → `grocery.py:2875-2924` (`_cas_adjust_balance` on both wallets). Same gate gap. Real money moves between two actors' wallets with authorization reduced to a stale, owner-set `for_sale`/`shareable` flag — not live per-transaction consent from the counterparty. |
| `allocate_fair_share`, `allocate_by_priority`, `allocate_ethically`, `pool_bulk_order`, `place_bid`, `return_borrowed_item` | N/A (dead code) | Zero callers anywhere in `grocery.py`. Not a live bypass today, but would be ungated if ever wired up — same `_propose_transition` name-recognition gap applies. |

**Verdict**: `TransitionGate` is a real, structurally-enforced boundary —
but it is a per-domain **opt-in** hook (`VerticalRuntime.propose_transition`),
not a structural chokepoint every mutating capability is forced through.
"No pre-negotiation state mutation" is **FALSE** as a repo-wide invariant.

## Stage 9 — Capability Execution

- **File/Function**: `ActionExecutor._execute_action()` →
  `capability.handle(action, context)`.
- **Status**: **IMPLEMENTED** as the intended single dispatch point;
  **BYPASSED** by the two paths above that reach `.handle()` without
  going through `execute()`'s gate logic.

## Stage 10 — Provider / External System

- No external network/payment/API provider layer analogous to the
  whitepaper's "secure tool execution" boundary was found gating calls
  from capabilities — this application's capabilities mutate internal
  state (KnowledgeGraph, wallets, inventory) directly rather than calling
  out to third-party systems. **N/A** for this codebase's actual scope;
  flagged rather than scored, per the audit's "do not invent
  requirements" rule.

## Stage 11 — World Commit

- **File/Function**: `KnowledgeGraph.compare_and_swap` (`knowledge_graph.py:640`),
  `try_reserve`/`confirm_reservation` (`grocery.py:1488` region).
- **Status**: **IMPLEMENTED** as an atomic, race-proven commit primitive
  (`test_shared_budget.py::test_budget004`, concurrent `asyncio.gather`,
  exactly one confirms). This is the arbitration mechanism for pure
  capacity races — not itself a policy/consent/negotiation check, and,
  per Stage 8, reachable directly by the bypass paths.

## Stage 12 — Audit

Three distinct mechanisms exist; only one is durable end-to-end for
commit-level events, and none give full per-action forensic coverage:

1. **`kernel/audit.py::AuditLog`** — hash-chained, tamper-evident,
   wired to an `AppendOnlyLog` at boot. Written only at **request
   intake** (`api/dependencies.py::record_request_audit`, called from
   `execute.py:228`) — records the request was submitted, before any
   policy/capability/negotiation decision. Its sibling module
   (`kernel/pipeline/audit_trail.py`) self-documents this one as
   **"in-memory only in practice"** — i.e. not reliably durable.
2. **`kernel/pipeline/audit_trail.py`** (Redis-backed `TimelineStore`,
   `execution_id`-correlated) — the actually-durable one. Real callers:
   `grocery.py:7310` (`payment_completed` DECISION event — actor_id,
   execution_id, amount, payment_id, order_id), `belief_runtime.py:549`
   and `pipeline/comparison/integration.py:462,550` (PLAN lifecycle
   events), `api/idempotency.py:392` (replay/conflict decisions).
3. **`ActionExecutor._publish_action_event`** (`action_executor.py:698`)
   — fires for every capability outcome (actor_id, capability, action_id,
   success, result, execution_id) but is not tamper-evident and carries
   no policy/consent/negotiation fields.
- **Gap closed**: `action_executor.py:319-350` now calls
  `record_decision_event("transition_gate_decision", ...)` — a fourth
  durable, `execution_id`-correlated `TimelineKind.DECISION` entry,
  written right where the TransitionGate decision itself is made, before
  `_execute_action` runs. Metadata carries `requires_negotiation`,
  `contention`, `counterparties`, `negotiation_decision`, and
  `security_outcome` (allowed / paused_for_negotiation /
  negotiation_rejected) — **Doot audit P1-7 fix** (re-verified
  2026-08-25: `record_decision_event` persists to the same Redis-backed
  `TimelineStore` `payment_completed`/plan-lifecycle events already use,
  confirmed via `audit_trail.py:74-98`).
- **Status**: **IMPLEMENTED** for every action that reaches the
  TransitionGate (i.e. every action with a recognized `_propose_transition`
  mapping — see Stage 8 for which capabilities that covers). WHO/FOR
  WHOM/WHAT AUTHORITY/WHAT POLICY DECIDED is now queryable per-execution
  via this DECISION entry, cross-linked to the same `execution_id` the
  commit and plan-lifecycle events already use. Still no such record for
  actions that never propose a transition at all — there was no policy
  decision made for those to record.

---

## Summary: stage-by-stage status

**Update (2026-08-25)**: Stages 3, 4, 5, and 12 were re-verified against
current code and found already fixed since this document was first
written (Doot audit P1-4, BYPASS-03, P1-6, P1-7 respectively — see each
stage's own section above for exact call sites). All are CognitiveOS-
core (`kernel/pipeline`, `kernel/society`, `kernel/governance.py`,
`kernel/plan/goals/executor.py`, `api/dependencies.py`)
authorization/policy/audit gaps; none required new work at
re-verification time, only updating this document to stop describing
already-closed gaps as open. **Correction to an earlier version of this
update**: Stage 5 (OPA) was previously marked "out of scope, separate
manufacturing package" — that was wrong. `api/main.py` deliberately
`sys.path`-inserts the directory OPA's client lives under specifically
so CognitiveOS's own imports resolve; it is real core infrastructure,
not foreign code, and has now been fully re-verified alongside the
other three. Stages 6-9's remaining bypasses are genuinely in
`kernel/domains/grocery.py`/`api/routes/orders.py` (commerce-vertical
capability wiring) — that part of the scope boundary still holds, not
re-verified here.

| Stage | Status |
|---|---|
| 1. Actor Intent | IMPLEMENTED (with two bypasses at Stage 8/9 — domain-scoped, see above) |
| 2. Identity | IMPLEMENTED (enforced-auth path); metadata-only otherwise |
| 3. Delegation | **IMPLEMENTED** (was PARTIAL; Doot audit P1-4 fix, re-verified 2026-08-25) |
| 4. Authorization | **IMPLEMENTED** (was PARTIAL at 6 routes; Doot audit BYPASS-03 fix, re-verified 2026-08-25) |
| 5. Policy (OPA) | **IMPLEMENTED** (was PARTIAL/fail-open; Doot audit P1-6 fix, re-verified 2026-08-25 — 3 real call sites traced, see above) |
| 6. Consent | PARTIAL — real but opt-in per-resource, no default coverage (domain-scoped) |
| 7. Negotiation | IMPLEMENTED for Order/Payment; BYPASSED elsewhere (domain-scoped) |
| 8. TransitionGate coverage | PARTIAL — real boundary, not universal (domain-scoped) |
| 9. Capability execution | IMPLEMENTED; BYPASSED by 2 known paths (domain-scoped) |
| 10. Provider/external | N/A for this codebase |
| 11. World Commit | IMPLEMENTED (atomic, race-proven) |
| 12. Audit | **IMPLEMENTED** for TransitionGate-reached actions (was PARTIAL; Doot audit P1-7 fix, re-verified 2026-08-25) |
