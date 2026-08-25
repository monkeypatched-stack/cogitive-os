# ADR-009: Idempotency-Key Support for Mutating World-Model Endpoints

## Status

Accepted

## Context

The Gate 2 (Production API) audit found zero idempotency support anywhere
in the codebase. The sharpest instance: a client retrying `POST /orders/
{id}/payment` after a dropped connection or timeout has no way to signal
"this is the same request" — the server has no memory of the first
attempt, so the retry runs `PaymentCapability` a second time and
double-charges the customer's wallet. The same class of bug applies to
`POST /orders` (duplicate order on retry), `POST /shipments` (duplicate
shipment), and every other mutating Commerce/Orders/Fulfillment/Events
endpoint.

## Decision

Added `src/monkey_brain/api/idempotency.py`: an opt-in
`Idempotency-Key`-header mechanism, applied via `@idempotent(resource)`
directly above the handler function (below `@router.*`) on every
mutating (POST/PATCH/DELETE) endpoint in the four files this most
directly affects — `commerce.py` (13 endpoints), `orders.py` (7),
`fulfillment.py` (8), `events.py` (1) — 29 endpoints total. No header
means no behavior change: every route runs exactly as it did before this
ADR, request for request. A header present means:

1. **First request with a key**: executes normally, response cached
   against that key.
2. **Retry with the same key AND same body**: returns the cached
   response, does not re-execute — this is the double-charge fix.
3. **Same key reused with a genuinely different body**: rejected with
   409, not silently replayed or silently executed as new — this is a
   client bug (key collision) and must surface as one, not be papered
   over in either direction.
4. **Two concurrent requests with the same key** (not a sequential
   retry — both in flight at once): an atomic `reserve()` (Redis
   `SETNX`, or a locked dict in-memory) ensures only one executes; the
   other gets 409 "already being processed" instead of a second
   execution racing the first.
5. **The handler raises**: the reservation is released, not completed —
   a transient failure (503, a bug since fixed) must be retryable with
   the same key; only a successful, already-committed side effect must
   not repeat.

Storage backend mirrors `kernel/plan/goals/run_store.py::RunStore`
exactly and for the same reason: `/orders` and `/orders/{id}/payment`
may land on different uvicorn workers, so a process-local cache alone
would let a retry hit a worker that never saw the first attempt.
`IDEMPOTENCY_STORE_BACKEND` (`auto`/`redis`/`memory`) + `REDIS_URL`
select the backend the same way `RUN_STORE_BACKEND` does; Redis errors
fail OPEN (allow execution) rather than blocking real orders on infra
trouble.

Scope was deliberately kept to the same four files Gate 2's typed-model
pass just covered, not extended to Actors/Societies/Memberships/World —
those are lower financial/duplication risk (creating an extra Actor via
a retried `POST /actors` is a nuisance; a retried `POST /orders/{id}/
payment` is a double charge) and were already explicitly deferred from
the typing pass for the same reason. Extending idempotency to them is a
tracked follow-up, not a gap silently left undocumented.

## Alternatives Considered

1. **ASGI middleware instead of a per-route decorator** — rejected:
   middleware would need to buffer and replay the request body to hash
   it and buffer the response to cache it, is harder to scope to
   specific endpoints (an allowlist check inside the middleware is more
   fragile than an explicit decorator on each route), and is less
   visible at the call site than `@idempotent(...)` sitting right next
   to the route it protects.
2. **A `Depends()`-based dependency** — rejected: a FastAPI dependency
   resolves and returns a value BEFORE the route handler runs; it
   cannot intercept and cache the handler's return value afterward
   without either duplicating the handler's logic in the dependency or
   the handler explicitly calling back into it. A decorator wrapping the
   whole call is the only clean way to run code both before AND after
   the real handler.
3. **Cache error responses too** (Stripe's approach) — rejected for
   this pass: correctly caching a 4xx/5xx alongside a 2xx adds real
   complexity (does a 503 get cached and replayed forever, hiding a
   since-fixed bug from a legitimate retry?) for a benefit — deduplicating
   client-error retries — that isn't the acute problem this ADR exists
   to fix. Only successful completions are cached; a failed attempt is
   always safe to actually retry.
4. **Global mandatory idempotency (reject any mutating request without a
   key)** — rejected: breaking every existing caller (including this
   session's own test scripts and the Postman collection) for a
   protection that should be opt-in, matching how Stripe/GitHub/every
   other production REST API that supports this actually does it.

## Consequences

- A client that cares about safe retries on Orders/Payments/Commerce/
  Fulfillment/Events now has a real mechanism — `Idempotency-Key: <uuid>`
  — verified end-to-end against the live server: identical retries
  return the cached result, key reuse across different requests 409s,
  and requests without the header are completely unaffected (confirmed
  via the full 154-endpoint collection sweep before and after — same
  pass count, same two pre-existing unrelated failures).
- `IdempotencyStore` is a second Redis-backed singleton alongside
  `RunStore` — same operational shape (`IDEMPOTENCY_STORE_BACKEND`,
  `IDEMPOTENCY_TTL_SECONDS`, `IDEMPOTENCY_STORE_CAPACITY` env vars),
  so anyone already operating `RunStore` in production already knows
  how to operate this.
- Actors/Societies/Memberships/World, and the Cognition endpoints
  (`/prompt`, `/plan`, `/execute`, `/simulate`, `/compare`, `/learn`),
  remain without idempotency support — tracked here as a deliberate
  scope boundary, not an oversight, and the natural next increment if
  duplicate-actor or duplicate-plan-execution risk becomes a proven
  problem rather than a hypothetical one.
