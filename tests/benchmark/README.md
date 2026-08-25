# MonkeyBrain Hello World Benchmark
# Buy Milk via Grocery App

## Prompt: Buy Milk via Grocery App

This benchmark validates the complete MonkeyBrain cognitive loop using a purely digital environment. The primary actor remains stationary throughout the scenario. All interactions occur through external grocery service providers (e.g., Instacart, Amazon Fresh, Walmart+, etc.). Physical navigation is intentionally excluded from this experiment.

---

# Objective

Implement an end-to-end benchmark demonstrating that MonkeyBrain can autonomously acquire **2 liters of whole milk** through a grocery delivery service.

The benchmark must exercise every stage of the cognitive architecture:

* Intent Compilation
* Goal Planning
* Execution Graph Generation
* World Model
* Observation
* State Fusion
* Execution
* Comparator
* Learning
* Replanning

No workflow may be hardcoded. The planner must generate the execution graph dynamically from the goal and current world state.

---

# Initial World State

```yaml
world:
  actor:
    location: Home

  pantry:
    whole_milk_liters: 0

  wallet:
    balance: 25.00

  order:
    status: null

goal:
  acquire:
    item: Whole Milk
    quantity: 2L
```

---

# Available Capabilities

The runtime may use capabilities similar to:

```text
SearchProviders
SearchProducts
CompareProducts
ComparePrices
AddToCart
Checkout
ProcessPayment
TrackOrder
ReceiveDelivery
UpdateWorldModel
```

No travel capability exists.

The actor must never change location.

---

# Expected Planning Output

MonkeyBrain should synthesize an execution graph similar to

```
Goal

↓

Discover Grocery Providers

↓

Search Milk

↓

Compare Candidates

↓

Select Product

↓

Add To Cart

↓

Checkout

↓

Payment

↓

Track Delivery

↓

Receive Delivery

↓

Verify Goal

↓

Learn
```

The exact graph is implementation dependent.

---

# World State Transitions

Initial

```text
Pantry.Milk = 0L
Order = None
```

After Checkout

```text
Order.Status = Confirmed
```

After Dispatch

```text
Order.Status = OutForDelivery
```

After Delivery

```text
Order.Status = Delivered
Pantry.Milk = 2L
```

Every transition must be produced through

```
W' = f(W, O)
```

where

* W = current world
* O = observation
* f = registered fusion function

---

# Required Observations

The benchmark must process observations such as

```text
Product found

Product unavailable

Payment authorized

Payment failed

Order confirmed

Driver assigned

Out for delivery

Delivered
```

Observations must update the world model.

---

# Comparator

The comparator succeeds only if

```text
Pantry.Milk >= 2L

AND

Order.Status == Delivered
```

---

# Learning

The learning subsystem should update historical knowledge such as

* provider reliability
* average delivery time
* cancellation frequency
* price history
* preferred grocery provider

Planner behavior should improve over repeated executions.

---

# Validation Tests

## Test 1 — Intent Compilation

Input

```text
Buy 2 liters of whole milk.
```

Expected

```text
Goal:
Acquire

Entity:
Whole Milk

Quantity:
2L
```

Pass Criteria

* Intent classified correctly
* Entity resolved correctly
* Quantity extracted

---

## Test 2 — Planner

Expected

Execution graph contains

```
Search

Compare

Cart

Checkout

Payment

Track

Receive
```

Pass Criteria

* Graph generated dynamically
* No hardcoded workflow
* Goal reachable

---

## Test 3 — World Model

Initial

```
Milk = 0L
```

After Delivery

```
Milk = 2L
```

Pass Criteria

State transition recorded correctly.

---

## Test 4 — Observation Fusion

Observation

```
Order Confirmed
```

Expected

```
Order.Status == Confirmed
```

Pass Criteria

```
W' = f(W,O)
```

executed successfully.

---

## Test 5 — Comparator

Expected Goal

```
Milk >=2L
```

Observed

```
Milk =2L
```

Pass Criteria

```
Loss = 0
```

---

## Test 6 — Learning

Execute benchmark ten times.

Expected

```
Provider confidence updated

Average delivery time updated

Historical pricing updated
```

Pass Criteria

Learning modifies planner inputs.

---

## Test 7 — Replanning (Out of Stock)

Observation

```
Selected provider has no milk.
```

Expected

Planner generates

```
Search Alternate Provider
```

Pass Criteria

Execution continues without failure.

---

## Test 8 — Payment Failure

Observation

```
Payment declined
```

Expected

Planner either

* retries with another payment method, or
* requests user intervention

Pass Criteria

No crash.

---

## Test 9 — Delivery Failure

Observation

```
Order cancelled
```

Expected

Planner selects another provider.

Pass Criteria

Goal still achievable.

---

## Test 10 — Provider Discovery

Initial World

```
Unknown grocery providers
```

Expected

Runtime discovers available providers dynamically.

Pass Criteria

Discovery is capability-driven, not hardcoded.

---

# Success Criteria

The benchmark passes only if all of the following are true:

* ✅ Intent compiled correctly.
* ✅ Goal generated.
* ✅ Execution graph synthesized dynamically.
* ✅ World model updated exclusively through observations.
* ✅ State transitions performed using the registered fusion function.
* ✅ Comparator verifies successful completion.
* ✅ Learning updates historical knowledge.
* ✅ Planner successfully replans after failures.
* ✅ Actor remains at `Home` for the entire benchmark.
* ✅ No grocery provider, workflow, or execution path is hardcoded.

This benchmark becomes the canonical **MonkeyBrain Hello World**: a compact, deterministic demonstration that the cognitive architecture—not domain-specific logic—can understand a goal, plan actions, adapt to changing observations, and achieve the desired outcome in a dynamic digital environment.
