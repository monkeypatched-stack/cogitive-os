# Affiliation-Based Communication Governance Demo

Six benchmarks (MB-3400 through MB-3405) verifying that Actor-to-Actor
communication in CognitiveOS is coordinated through **Affiliations and
Society governance**, never by an actor directly addressing an
arbitrary other actor:

```
Sender -> Affiliation(s) -> Society (owns the Communication Policy)
       -> Eligible Recipients -> Natural-Language Communication
```

## What was actually new here

Research before writing any code found the governance PRIMITIVES
already existed, real and tested, but nothing in the natural-language
communication path called them:

- **`AffiliationCommunicationRouter`** (`kernel/society/communication.py`)
  — real `resolve(sender_id, recipient_id) -> CommunicationDecision`
  (allowed/denied + reason + which affiliation permitted it), already
  wired into `SocietyRuntime.send_message`/`broadcast_message`/
  `eligible_recipients`, already publishing
  `communication.affiliation_resolutions`/`routing_decisions`/
  `denied_communications`.
- **Two separate natural-language "ask" code paths bypassed it
  completely** — `AskActorCapability.handle()` (`kernel/domains/
  grocery.py`, selected by an actor's own LLM planner) and the real
  `POST /actors/{id}/ask` HTTP route (`api/routes/actors.py`, used
  directly by orchestration scripts like `demo/conversation`) both
  resolved a target purely by name/ID across every Society in the
  runtime — `Actor -> Any Actor`, the exact anti-pattern this spec
  exists to rule out. Confirmed by grep: zero references to
  `AffiliationCommunicationRouter` or `discover_participants` in either
  file before this change.

## What changed

- **`PlanetaryRuntime.resolve_communication(sender_id, recipient_id)`**
  (new, `kernel/society/integration.py`) — the cross-society-aware
  entry point both call paths now share. If sender and recipient
  currently share ANY `SocietyRuntime` (including one only one side is
  present in *temporarily*, via `add_temporary_participant`), delegates
  to that runtime's own router — real shared-affiliation and
  presence-driven-temporary-membership semantics, unchanged. With no
  shared society, resolves across every managed society with an empty
  `society_id`, which disables the router's own same-society fallback:
  only a real, shared Affiliation can bridge two different societies —
  mere co-location in one can never bridge to a different one, and
  affiliations never compose transitively (A~B and B~C does not imply
  A~C).
- **`AskActorCapability.handle()`** now calls
  `resolve_communication()` right after resolving a name to an actor
  id; a denial returns `{"success": False, "denied": True, "error":
  <real reason>, "sender_affiliations": [...], "recipient_affiliations":
  [...]}` and never invokes `AnswerQuestionCapability` — a denied
  communication produces no reply at all, not a reply that's silently
  allowed anyway. An allowed ask folds `affiliation_id`/`society_id`/
  `reason` into the real result for explainability.
- **`POST /actors/{id}/ask`** gained the identical check (403 with the
  real reason on denial) when the caller supplies `from_actor_id` — the
  second, previously-unguarded path is closed too, not just the
  planner-driven one.
- **New `BroadcastToAffiliationCapability`** (`"BroadcastToAffiliation"`)
  — the UNDIRECTED counterpart to `AskActor` ("can someone help pack
  this order", "everyone in Warehouse A stop"). Wraps the existing,
  previously-unused `SocietyRuntime.broadcast_message()` directly; the
  real, scoped recipient list, not an assumption.
- **`LLMPlanner`'s system prompt** gained a compact block: `AskActor`
  targets must be reachable (a denial's real reason becomes an
  actionable fact for the actor's next round), and when to prefer
  `BroadcastToAffiliation` over guessing a single colleague's name.
- **New Lemon metrics** `communication.societies_traversed`,
  `communication.average_routing_time_ms`,
  `communication.messages_per_affiliation` — emitted from the two
  capabilities, not the router itself (keeps the router framework-
  agnostic, matching its own module docstring).

## Benchmarks

| ID | Scenario | Verifies |
|---|---|---|
| MB-3400 | Warehouse Team broadcast | Affiliation-scoped delivery excludes an unaffiliated colleague in the SAME Society |
| MB-3401 | Customer Support routing | Customer can't reach the Warehouse directly; reaching it only works via Support Agent's own, real dual affiliation |
| MB-3402 | Cross-affiliation chain | Two real, direct affiliation hops (Merchant<->Logistics, Logistics<->Warehouse) do NOT compose into a third, transitive one |
| MB-3403 | Unauthorized communication | "Message the CEO directly" is denied with a real, specific, explainable reason |
| MB-3404 | Temporary affiliation via presence | Full grant-then-revoke cycle: denied -> enter Space -> allowed -> leave Space -> denied again, with zero Affiliations ever created |
| MB-3405 | Broadcast scoping | Broadcast is Society-scoped, not global-affiliation-scoped — an actor in a DIFFERENT Society holding the same Affiliation string still never receives it |

## Status: not yet run live

Every script here is real, working code against real API routes — no
runtime internals, no simulated results — following this session's
established `bootstrap_mbXXXX.py` + `mbXXXX_*.py` pair convention. None
of the six have been executed yet, so there is no real transcript or
TimelineStore-verified pass/fail to report honestly (per this
codebase's own documentation discipline: only a REAL run earns a PASS
row here). To run one:

```bash
cd demo/affiliation
python3 mb3400_warehouse_team.py   # etc., mb3401 through mb3405
```

Requires a running server (`DEMO_BASE_URL`, default
`http://localhost:8031/api/v1/agentos`) with a real LLM backend
configured — `BroadcastToAffiliation` (MB-3400, MB-3405) goes through
the real LLM planner via `/prompt`; `AskActor` (MB-3401-3404) uses the
deterministic HTTP route directly, but the reply text on an allowed ask
is still a real `AnswerQuestionCapability` LLM call.

## An honest limitation surfaced while designing this suite

`BroadcastToAffiliationCapability` has no cross-society mode —
`SocietyRuntime.broadcast_message()` only ever consults its own
`active_actors()`. That's exactly what MB-3405 verifies as a real
architectural boundary (a Distribution Worker holding the identical
Affiliation string in a different Society never receives a Warehouse
broadcast), but it also means an actor can only ever broadcast to its
own home Society, even to a genuinely shared Affiliation that spans
Societies (the way `resolve_communication()` lets `AskActor` do). If a
future scenario needs "broadcast to everyone sharing affiliation X,
wherever they are," that's new work, not something this suite silently
assumed already worked.
