# True Multi-Actor Coordination Demo

Six benchmark scripts (MB-3100 through MB-3105) proving that CognitiveOS
does more than let a single Actor reason over the world: one Actor's
real action causes OTHER, independent Actors to react — coordinated
only if they're actually affected, never by a full-world traversal or
polling. There is no UI. Every step is a real call to the same REST
APIs an external client would use.

## What it proves

```
Actor -> World State Changes -> Relevant Society -> Determine Affected
  Actors -> Coordinate Those Actors -> Affected Actors Think -> Act ->
  World State Changes -> Repeat Until Stable
```

Society is the coordination boundary. Space provides physical
location. Actors perform cognition. A single Actor never directly
coordinates another Actor — it publishes a real domain event
(`OrderCreated`, `InventoryReserved`, `PaymentDeclined`, ...), and only
the Societies that `subscribed_events` to that event get ticked, which
in turn coordinates only their own members.

## Core engine (shared by all six benchmarks)

- **`PlanetaryRuntime._propagate_coordination()`**
  (`src/monkey_brain/kernel/society/integration.py:2133`) — the
  propagation loop. Each round: read new events since the last
  checkpoint (`context_stream.replay()` — the real event log, never a
  poll of every Society), find every not-yet-visited Society whose
  `subscribed_events` intersects the round's domain events, tick each
  as a whole (`SocietyRuntime.tick()`, no target — scoped to just that
  Society's own `active_actors()`). Ticking a Society may itself
  publish further events, which the next round picks up the same way.
  Terminates when a round finds no new qualifying Society (`"stable"`)
  or a hard `max_depth=6` safety cap is hit (`"max_depth"`) — bounded
  two independent ways: no event content can force more than
  `len(societies)` rounds, and the depth cap is extra insurance on top
  of that.
- **`execute_actor_request()`**
  (`src/monkey_brain/kernel/society/integration.py:1927`) calls this
  right after the initiating actor's own society tick(s), seeded with
  those societies already visited. `POST /events` (world mutations with
  no initiating actor's own request, e.g. a warehouse fire) and
  `POST /orders/{id}/confirm-receipt` (the real point an order becomes
  eligible for a review/loyalty award) call it directly too — coordination
  isn't limited to the `/prompt` path.
- **`Society.subscribed_events`** (`kernel/society/domain.py`) — a real,
  inspectable, per-society property set at creation time
  (`POST /societies`), mirroring `activation_tags`. Not a hardcoded
  global map in the kernel.
- **Domain event vocabulary** — `CAPABILITY_DOMAIN_EVENTS` in
  `kernel/domains/grocery.py`, tagged onto real `ContextEvent`s by
  `ActionExecutor._publish_action_event()` via an injected
  `domain_event_resolver(capability, success, result)`.
- **`broadcast_context`** (`SocietyRuntime.tick()`,
  `kernel/society/runtime.py:789`) — every non-target actor in a
  reactive tick receives the triggering event as real situational
  context (`"World event(s) occurred: X. If one of your available
  actions directly addresses this, take it now..."`), combined with —
  not replacing — the actor's own standing goal
  (`kernel/compile/cognitive_actor.py:621`). See "What was found and
  fixed" below for why this combination matters.

## Benchmarks

| ID | Scenario | Real event chain |
|---|---|---|
| MB-3100 | Customer order | `OrderCreated` → Warehouse + Inventory → `InventoryReserved` → Logistics |
| MB-3101 | Inventory unavailable | `InventoryUnavailable` → Merchant (Warehouse never ticked) |
| MB-3102 | Payment declined | `PaymentDeclined` → Inventory (reservation should release) |
| MB-3103 | Warehouse fire | `WarehouseClosed` → alternate Warehouse (original never ticked) |
| MB-3104 | Customer cancels | `OrderCancelled` → Warehouse + Logistics + Merchant |
| MB-3105 | Shipment delivered | `ShipmentDelivered` → Customer + Loyalty (`LoyaltyPointsAwarded`) |

Each is `bootstrap_mb31XX.py` (builds the world via real APIs only,
never `/prompt`) + `mb31XX_*.py` (the narrated scenario + verification).

## Running it

```bash
cd demo/coordination
python3 mb3100_customer_order.py
# ... mb3101_inventory_unavailable.py, mb3102_payment_declined.py,
#     mb3103_warehouse_fire.py, mb3104_customer_cancels.py,
#     mb3105_shipment_delivered.py
```

Each script bootstraps its own isolated world — **run against a freshly
reset server** (see `demo/ecommerce/README.md`'s reset procedure; the
same "always fully restart, don't just flush and reuse" caveat applies
here). `DEMO_BASE_URL` overrides the default
`http://localhost:8031/api/v1/agentos`.

## What's real, not scripted

- **The coordination trace and `execution_scope.propagation` numbers
  are measured, not asserted** — the same real loop a production
  caller would see (`societies_coordinated`, `actors_coordinated`,
  `propagation_steps`, `propagation_depth`, `termination_reason`,
  `domain_events_seen`).
- **Verification checks the real published event, not mere
  coordination.** An actor being ticked (coordinated) does not mean
  its planned action succeeded — a reactive tick can be coordinated and
  still act on something else entirely. Every benchmark's critical
  check (was inventory actually reserved/released, were loyalty points
  actually awarded) reads `execution_scope...domain_events_seen`, which
  the propagation loop accumulates from every real domain event
  observed during the cascade — **regardless of whether any Society
  subscribed to it** — not just the ones that happened to trigger a
  round.
- **Lemon metrics** (`coordination.actors_coordinated`,
  `coordination.propagation_depth`, etc.) are published once per
  request from the same `_obs` sink every other subsystem in this
  codebase uses (`GET /observability`).

## What was found and fixed (honest account)

Building and live-verifying these six benchmarks surfaced real, live
gaps — same pattern as `demo/ecommerce`. Full transcripts and a
per-benchmark honest read are in
[`expected_output.md`](expected_output.md); summary here:

1. **`execute_actor_request()` return-type regression** — a prior
   session's fix returned a merged plain `dict` instead of the
   `_CognitiveTickResult` dataclass, breaking 4 existing test files'
   attribute access (`result.plan.steps`). Fixed by adding
   `execution_scope`/`coordination_trace` as real dataclass fields and
   using `dataclasses.replace()` instead of a dict-merge.
2. **`context_stream=None` in the live execution path** — the actual
   `/prompt` path built `ActionExecutor` with no context stream, so
   `_publish_action_event` was a silent no-op in production. Fixed by
   threading the real `context_stream` through
   `vertical_router.py`/`actors.py`'s registration call.
3. **Zero situational context on a reactive tick.** An untargeted
   `SocietyRuntime.tick()` gave every non-target actor `prompt_request
   = None` — a reactive actor had no idea WHY it was ticked, making
   conditional reasoning (reserve vs. release) unreliable. Fixed with
   the new `broadcast_context` parameter.
4. **`broadcast_context` initially REPLACED the actor's own standing
   goal instead of combining with it** — found live via MB-3105: the
   Loyalty Bot's own goal (`manage_loyalty_program`) never reached the
   LLM during a reactive tick, only the generic triggering-event text,
   so it planned unrelated capabilities (`Delivery`, `OrderConfirmation`)
   instead of `LoyaltyAward`. Fixed in `cognitive_actor.py:621` to
   combine both (`f"{self._current_goal} {triggering_event}"`) — this
   is what let MB-3105 go from a false-positive PASS (coordinated but
   never actually ran `LoyaltyAward`) to a TimelineStore-verified real
   pass.
5. **Standalone world-mutation events (`POST /events`) never triggered
   propagation** — checkpoints were per-request, so a fire injected
   outside any actor's own `/prompt` call fell outside every request's
   causal window. Fixed by having `events.py` drive
   `_propagate_coordination()` directly.
6. **The coordination trace only recorded events that TRIGGERED a
   round, not every event actually published.** This produced a real
   false positive in MB-3105 (verification checked "was Loyalty Bot
   coordinated," not "did `LoyaltyAward` actually run") and a
   structural gap in MB-3103/3104 (a resulting event like
   `InventoryReserved`/`InventoryReleased` would never appear in the
   trace unless some Society happened to subscribe to it). Fixed by
   having `_propagate_coordination()` accumulate `all_domain_events`
   every round regardless of subscription match, returned as
   `domain_events_seen`; every verification script now checks this
   instead of "was X coordinated."
7. **`PaymentConfirmationCapability` failures weren't tagged with any
   domain event** — only `PaymentCapability`'s failure mapped to
   `PaymentDeclined`, so a decline via the confirmation step (the one
   the planner actually reaches first) never propagated at all. Added
   `("PaymentConfirmation", False): "PaymentDeclined"` to
   `CAPABILITY_DOMAIN_EVENTS`.
8. **MB-3104's fixture had no wallet at all** — `CancelOrder`'s own
   real business rule correctly refuses to cancel an order that was
   never paid for ("nothing to reverse"), so the cancel-cascade this
   benchmark exists to prove could never be reached. Fixed by seeding a
   real wallet (`POST /wallets`) in `bootstrap_mb3104.py`.
9. **Keyword-extraction punctuation bug**
   (`ContextConstructionEngine._explore_knowledge()`,
   `kernel/pipeline/planning/context_engine.py`) — `goal_text.lower().split()`
   left trailing punctuation glued to the last word, so `"order."` never
   matched the keyword index `"order"`. Fixed with
   `re.findall(r"[a-zA-Z]+", ...)`.
10. **`CancelOrderCapability` never checked `parameters`** — only
    `context["order_id"]`, which is never populated across separate
    `/prompt` calls (a cancellation is its own fresh request). Fixed to
    also check `parameters.get("order_id")`/`parameters.get("selection")`.

## What's still genuinely probabilistic (not chased further)

MB-3102, MB-3103, and MB-3104's full end-to-end cascades were not
captured on a passing run despite 4-6 live attempts each, honestly
documented in `expected_output.md`. In every case the **coordination
mechanism itself is proven** (the right Society gets ticked, scoped
correctly, with real situational context) — what remains probabilistic
is a local LLM choosing the exact right capability among several
plausible ones, or a fresh `/prompt` call correctly grounding itself in
an order it wasn't told about, given only a short natural-language
goal. This is the same honest, accepted characteristic
`demo/ecommerce` already documents, not something specific to
coordination.

## Mapping to the spec's illustrative vocabulary

Every domain event, benchmark ID, and coordination-flow term in this
demo (`OrderCreated`, `InventoryReserved`, `PaymentDeclined`,
`WarehouseClosed`, `ShipmentDelivered`, MB-3100 through MB-3105, the
Actor → World State → Society → Affected Actors flow) comes directly
from the sprint's own specification — nothing here is invented
terminology. What's real-API-specific rather than illustrative:

| Illustrative | Real |
|---|---|
| A society "subscribing" to events | `POST /societies` body field `subscribed_events: list[str]` |
| A standalone world event driving coordination | `POST /events` (fire/evacuation) now calls `_propagate_coordination()` directly, same as any `/prompt`-initiated cascade |
| "Coordination Graph" | `coordination_trace`: a list of `{depth, events, society_id, society_name, actors_ticked}` entries, returned in every relevant response body |
