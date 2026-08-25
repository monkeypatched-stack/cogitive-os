# Expected Output

This is a **real, unedited transcript** from an actual run of
`run_demo.py` against a properly, fully reset environment (server
stopped, Redis/Mongo cleared, server restarted, then
`python3 run_demo.py`) — not a hand-written mockup. Every number below
(latencies, actor counts, plan text) came from a live server; nothing
here is synthetic.

Because reasoning is LLM-backed, exact wording — and even whether the
plan's action *sequence* visibly differs — will vary between runs.
What *is* reproducible: `Goal Achieved: True` with all actions
succeeding on both prompts, `Execution Scope` showing exactly 1
space/1 society/1 actor coordinated per request (not the whole world),
actors measurably evacuated by the fire, and real metrics from
`/observability` every time.

```
========================================================
CognitiveOS Backend Demonstration
========================================================

Bootstrapping World
✓ Geography Created
✓ Societies Created
✓ Actors Created
✓ Products Loaded
✓ World Validation Passed

--------------------------------------------------------
Planetary Cycle
--------------------------------------------------------
Cycle ..................... 1
Actors Coordinated ........ 0
Interactions Routed ....... 0
Context Events ............ 23
Cycle Duration ............ 11.6 ms

--------------------------------------------------------
Customer Prompt
--------------------------------------------------------
"I need a wireless gaming mouse under $100 that can arrive tomorrow."

Intent:
  Action .................. Purchase Product
  Product .................. Wireless Gaming Mouse
  Budget .................. $100
  Delivery .................. tomorrow

Plan (4 steps):
  1. ProductSelection — Select the Wireless Gaming Mouse based on the provided facts and the goal.
  2. OrderConfirmation — Confirm the order for the selected product.
  3. OrderCreation — Create the order with the selected product.
  4. Delivery — Schedule the delivery of the ordered product for tomorrow.

Execution:
  ✓ ProductSelection — selected Wireless Gaming Mouse ($59.99)
  ✓ OrderConfirmation — status=confirmed
  ✓ OrderCreation — order_id=ORD-1785791482-aea4d641bbd84c0d88b086ff74fe9499
  ✓ Delivery — status=scheduled

Goal Achieved: True
Actions Executed: 4 (success=4, failure=0)
Round-trip: 24846 ms

Execution Scope:
  Spaces Coordinated ...... 1
  Societies Coordinated ... 1
  Actors Coordinated ...... 1
  Graph Nodes Traversed ... 1
  Context Events Consumed . 23
  Context Events Produced . 5

--------------------------------------------------------
Inject Event
--------------------------------------------------------
Warehouse Fire
Actors Evacuated .......... 4

--------------------------------------------------------
Planetary Cycle
--------------------------------------------------------
Cycle ..................... 2
Actors Coordinated ........ 4
Interactions Routed ....... 0
Context Events ............ 61
Cycle Duration ............ 50722.8 ms

--------------------------------------------------------
Customer Prompt
--------------------------------------------------------
"I need a wireless gaming mouse under $100 that can arrive tomorrow."

Intent:
  Action .................. Purchase Product
  Product .................. Wireless Gaming Mouse
  Budget .................. $100
  Delivery .................. tomorrow

Plan (3 steps):
  1. ProductSelection — Select the Wireless Gaming Mouse with the lowest price under $100.
  2. OrderCreation — Create an order for the selected Wireless Gaming Mouse.
  3. Delivery — Schedule delivery for tomorrow.

Execution:
  ✓ ProductSelection — selected Wireless Gaming Mouse ($59.99)
  ✓ OrderCreation — order_id=ORD-1785791546-679d3581f9f4481696ded86274efd9cf
  ✓ Delivery — status=scheduled

Goal Achieved: True
Actions Executed: 3 (success=3, failure=0)
Round-trip: 13252 ms

Execution Scope:
  Spaces Coordinated ...... 1
  Societies Coordinated ... 1
  Actors Coordinated ...... 1
  Graph Nodes Traversed ... 1
  Context Events Consumed . 61
  Context Events Produced . 5

--------------------------------------------------------
Reasoning Comparison
--------------------------------------------------------
Selected Product .......... Wireless Gaming Mouse (unchanged)
Product Inventory ......... 40 -> 40 (unchanged)
Warehouse Staffing ........ 4 -> 0 (changed)
Plan Steps ................ changed
  Before: ProductSelection -> OrderConfirmation -> OrderCreation -> Delivery
  After:  ProductSelection -> OrderCreation -> Delivery

Reason: Warehouse fire evacuated the on-site team (4 -> 0 present); the product itself remained in stock, so the order still routes through the same store.

--------------------------------------------------------
Lemon Metrics
--------------------------------------------------------
Planner Latency ........... 13178.5 ms
Planetary Tick ............ 50722.8 ms
Graph Entities (KG) ....... 19
Entities Ticked ........... 8
Societies Ticked .......... 1
Actors Observed ........... 4
Interactions Routed ....... 0
Context Events ............ 61

========================================================
Benchmark Summary
========================================================
World Validation .......... PASS
Prompt Reasoning .......... PASS
Execution ................. PASS
Context Propagation ....... PASS
Adaptive Reasoning ........ PASS
Planetary Cycle ........... PASS
--------------------------------------------------------
World
  Actors .................. 8
  Societies ............... 7
  Spaces .................. 13
  Graph Entities .......... 19
  Context Events (2nd tick) . 61
========================================================
```

## Reading this transcript honestly

- **`Goal Achieved: True`, all actions succeeding, on both prompts,
  with `Execution Scope: 1 space / 1 society / 1 actor` on every
  request.** This is the current state after a long sequence of real,
  live-discovered fixes this session — most recently two architectural
  ones:

  1. **Society-Scoped Interactive Execution.** `execute_actor_request()`
     (`src/monkey_brain/kernel/society/integration.py`) used to start a
     full `GeographicEntityRuntime` traversal at the Planet root for
     *every* `/prompt` call — ticking every physically-present actor at
     every Space in the entire world as a side effect, confirmed live:
     a single customer request was coordinating all 8 demo actors
     across 7 societies, not just the requesting customer. Fixed by
     using the method's own already-computed `society_ids` (=
     `effective_societies(actor_id)`, permanent UNION temporary — the
     correct scope was already being calculated, just discarded) to
     call `SocietyRuntime.tick(target_actor_id=...)` directly, once per
     effective society, instead of walking the whole planet.
     `POST /planet/tick` is untouched — it's still the only operation
     that performs a full world simulation. This is what dropped
     per-prompt round-trip from 95-280s to 13-25s: not a latency
     optimization pass, a correctness fix whose speedup was the
     expected, direct consequence of no longer doing unrelated work.
  2. **The planetary-cycle distributed lock had no active release.**
     `_acquire_planetary_cycle_lock()` sets a Redis lock with a 330s
     TTL and nothing ever called `DEL` on it — a cycle that finished in
     milliseconds still blocked every other tick attempt (including the
     same process's own next one) for up to 5.5 minutes. This was
     always latent but only became visible once fix #1 made prompts
     fast enough for two explicit `/planet/tick` calls to land inside
     the same lock window. Fixed by releasing the lock in a `finally`
     block as soon as a cycle actually completes; the TTL remains as
     the crash safety net for a replica that dies mid-cycle, exactly as
     documented before this fix.

  Earlier in the session, four other real production gaps were found
  and fixed the same way — by running this exact demo against a live
  server and reading the real failures:
  - `ProductSelection` had no way to act on its own candidates (a
    `decision_required` contract nothing consumed) — fixed by giving
    `PlanStep` a real `parameters` field, having the LLM planner's
    prompt/schema ask for a structured selection, surfacing real
    `id=`/`price=` facts to the model, and threading `step.parameters`
    into the executed `Action`.
  - The store had no address (`DeliveryCapability` requires one) —
    `address` was already a real `POST /merchants` field, just unset.
  - There was no production API for a customer's delivery address in
    the commerce KG — `POST /actors/{id}/addresses` extended to also
    write it.
  - There was no production API for a delivery rider — added
    `POST /riders` (`kernel/domains/logistics.py::onboard_rider`).

  Two LLM-echo edge cases (the model literally reproducing words from
  its own system-prompt instructions — "empty", "none granted" — as if
  they were real permission values) were fixed structurally in
  `_normalize_required_permission()`: any real permission is
  `"resource:action"` shaped, so anything without a colon is now
  treated as no-permission regardless of exact wording. Two more
  transient-reliability retries (malformed-JSON plan parsing, an
  occasional `/prompt` response with no execution data) were added the
  same session.

- **`Execution Scope` is the concrete proof of the scoping fix**: 1
  space, 1 society, 1 actor coordinated for Alice's request — not the
  other 7 actors across Merchant/Warehouse/Logistics/Payment/Support
  societies. Confirmed by running an *unfixed* version of this exact
  demo earlier the same session, which showed `Actors Coordinated`
  values matching the full 8-actor world on every request.
- **The plan genuinely changed** (`OrderConfirmation` step dropped)
  after the fire in this run — real LLM reasoning over genuinely
  different world state, not scripted. On other runs the plan's step
  *names* have stayed the same while the underlying facts (warehouse
  staffing) still changed — both are legitimate, see the Adaptive
  Reasoning check in the benchmark summary, which looks at real facts,
  not just plan text.
- **Round-trip times are still real, LLM-backed latency and will
  vary** (13-25s in this run) — just no longer inflated by ticking
  unrelated actors.
- **"Actors Coordinated: 0"** on the Planetary Cycle's very first
  tick, before any actor has been through a belief/observation cycle,
  then 4 on the second tick (matching the fire's evacuees) — real, not
  a bug. Note this is `/planet/tick`'s own actor count (the full-world
  cycle, unaffected by the scoping fix), separate from `/prompt`'s
  `Execution Scope` numbers.
