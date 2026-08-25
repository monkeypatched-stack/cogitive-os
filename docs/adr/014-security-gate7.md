# ADR-014: Security (Gate 7) — Secrets Fail-Fast, Real Audit Trail, Real Login

## Status

Accepted

## Context

Auditing "authentication / authorization / API keys / OAuth / rate
limiting / audit logs / input validation / secrets management" found —
like Gates 5 and 6 — most of this already built to a genuinely
production-grade standard: authentication is secure-by-default (JWT
Bearer with real permission decoding, `X-User-ID` dev-mode fallback,
fails closed unless `AGENTOS_AUTH_REQUIRED` is explicitly disabled),
authorization combines permission-based (`require_permission`) and OPA
policy-based (`require_opa`) checks with ABAC attribute threading, rate
limiting is a real IP-based token bucket middleware already enforced,
and input validation is substantially covered (Gate 2 plus pre-existing
Pydantic). Two items were genuine gaps:

1. **Secrets management**: `routes/keys.py`'s own docstring claimed
   `SecureKeystore` "now refuses to start without [`KEYSTORE_SECRET`]" —
   but the actual code in `kernel/execute/keystore.py` just logged a
   warning and silently minted a new ephemeral Fernet key every boot.
   `KEYSTORE_SECRET` is not set in this environment, so every API key
   ever stored through this route was already permanently undecryptable
   on the next restart — a claim-vs-reality gap in the same shape Gate 6
   found for RunStore/IdempotencyStore. The keystore was also, like
   `KnowledgeGraph` before Gate 6, purely in-memory with no persistence
   at all.
2. **Audit logs**: `src/introspection/audit.py::record()` is a real,
   general-purpose, append-only (MongoDB-backed when
   `AUDIT_MONGODB_ENABLED`) audit framework — but its only caller
   anywhere in the codebase was `api/dependencies.py`'s auth-*denial*
   path. Every successful mutating action (orders, payments, refunds,
   actor deletion, admin backup/restore/shutdown, API key management)
   left no audit trail — only who was denied access was ever recorded,
   never who actually did what.

OAuth does not exist anywhere in this codebase. Rather than build a
speculative flow with no real provider/use-case to target, this was
explicitly deferred per user direction — a genuine future feature
decision, not a bug to close.

## Decision

**SecureKeystore fail-fast + persistence**
(`kernel/execute/keystore.py`): `_get_cipher()` now raises `RuntimeError`
when `KEYSTORE_SECRET` is unset, matching what the docstring already
claimed should happen — `routes/keys.py`'s existing
`try/except RuntimeError → 503` handler needed no changes, it was
already written for this. Persistence was only safe to add AFTER the
fail-fast fix (persisting Fernet-encrypted blobs under a key that
changes every boot would be actively worse than not persisting them —
confidently wrong data instead of honest data loss): `SecureKeystore`
now optionally takes a Redis client (auto-connecting via the same
`REDIS_URL`-with-`REDIS_HOST`/`REDIS_PORT`-fallback pattern this session
already fixed for `RunStore`/`IdempotencyStore`), writes each key
record via `HSET` on `add_key()`/`HDEL` on `remove_key()` — O(1) per
mutation from the start — and loads all records via `HGETALL` on
construction.

Verified live end-to-end: confirmed `POST /keys` now 503s with no
`KEYSTORE_SECRET` set (previously would have silently "succeeded" with
an undecryptable key); with a stable `KEYSTORE_SECRET` configured,
stored a key, restarted the server, confirmed the record survived
(`SecureKeystore loaded: 1 keys`) AND that decryption still produces the
original plaintext (constructed a second `SecureKeystore` with the same
secret and called `get_plaintext()` — exact match).

**Real audit trail** — `api/audit_decorator.py::audited(action)`,
mirroring `idempotency.py::idempotent()`'s exact shape (`functools.wraps`
so FastAPI still resolves `Depends()`/body/path params through the
wrapper; verified stacking the two decorators together against a live
TestClient before applying either to a real route). Records one
`AuditRecord` per call via the existing `introspection.audit.record()` —
`outcome="success"` if the handler returns normally, `outcome="error"`
(with the exception message) if it raises — so a failed privileged
action is on the record too, not just successful ones. Applied to the
financially/security-sensitive subset of routes rather than all 244
endpoints, matching the same "acute risk first" scoping ADR-009 used for
idempotency: `orders.payment`, `orders.cancel`, `orders.return_approve`,
`orders.refund`, `actors.delete`, `admin.shutdown`, `admin.backup`,
`admin.restore`, `keys.add`, `keys.delete`.

While wiring this, found and fixed a real, separate naming bug in
`routes/keys.py`: `add_key`'s Pydantic body parameter was itself named
`request` (colliding with the Starlette `Request` convention every other
route in the codebase uses) — renamed to `body` for consistency and
correctness. The decorator's own `kwargs.get("request")` lookup is also
now defensive (`isinstance(request_candidate, Request)`), protecting
against the same class of collision anywhere else it isn't yet noticed.

Verified live: `POST /keys` (success), `POST /orders/{id}/payment`
(both a real success and a real `outcome="error"` case — attempted
payment against an actor with no wallet, confirmed the error was
audited, not silently dropped), and `DELETE /actors/{id}` all produced
real `AUDIT ...` log lines with correct `action`/`outcome`/`subject`/
`trace_id`.

## Addendum — `routes/actor_profile.py`'s login/logout/sessions were entirely fake

The initial pass credited "authentication" as already real by checking
`api/dependencies.py` (the JWT-Bearer/`X-User-ID` system every route's
`require_permission` depends on) — genuinely real — but missed a second,
parallel, mounted-and-reachable router: `POST /api/v1/actors/{id}/login`
accepted **any** email/password combination and returned a hardcoded
`"mock_token_" + actor_id` string (with an explicit
`# TODO: Implement actual JWT generation` comment admitting it), `logout()`
and `sessions()` always returned canned/empty responses regardless of
reality. This is worse than having no login endpoint: it looks
functional enough that an integrator could reasonably believe they'd
wired up real authentication.

The real infrastructure already existed, just never called:
`kernel/login_info.py::LoginInfo` — PBKDF2-HMAC-SHA256 password hashing
(100k iterations, salted), constant-time verification
(`hmac.compare_digest`), account lockout after 5 failed attempts (30
minutes), and full session tracking — and
`services/auth/helpers/tokens.py::create_access_token`, the same JWT
issuance function `require_permission`'s `decode_access_token` already
verifies. Fixed by wiring them together for real rather than building
new security primitives:

- `kernel/login_store.py` (new): Redis-backed `LoginInfo` persistence,
  the same `REDIS_URL`-with-fallback + HSET-per-actor pattern as every
  other store fixed this session.
- `PUT /actors/{id}/account` now accepts an optional `password` field —
  the only way credentials get established, since no separate
  registration endpoint exists — calling `LoginInfo.set_password()`
  (rejects weak passwords with a real 400, not a silent accept).
- `POST /actors/{id}/login` now actually calls `verify_password()`;
  fails honestly with 401 ("no credentials configured") for an actor
  who never set one, 401 for a wrong password, 423 once locked out — and
  on real success, issues an actual signed JWT via `create_access_token`
  and creates a real `SessionInfo`.
- `POST /actors/{id}/logout` invalidates every active session for that
  actor (chosen over per-session token tracking for simplicity — a
  legitimate "log out everywhere" semantic, not a shortcut around a
  harder problem).
- `GET /actors/{id}/sessions` returns real, current `active_sessions`.

Verified live end-to-end: login before any password is set → 401
(previously: fake success); wrong password → 401; correct password →
a real, decodable JWT (`sub`/`email`/`role`/`permissions`/`exp` claims
matching what `require_permission` expects) plus a real session
appearing in `GET .../sessions`; logout → session count correctly drops
to zero; 5 wrong-password attempts → account lockout (423), confirmed
the account stays locked even against the CORRECT password;
credentials and the ability to log in both survive a full server
restart (Redis-backed, not the ephemeral in-memory state login/sessions
had before).

`profile` GET/PUT were left as unauthenticated metadata stubs —
genuinely out of scope for a fix that was specifically about the parts
of this file that looked like real authentication but weren't.

## Addendum — OTP (`POST .../otp/request`, `POST .../otp/verify`)

`LoginInfo.generate_otp()`/`verify_otp()` were equally real and equally
never called: 6-digit code, 5-minute expiry, 3-attempt limit,
constant-time comparison, auto-marks email/mobile verified and
activates the account on success. Wired to two new endpoints, same
`LoginStore` persistence.

The one genuine open question: this codebase has no real email/SMS
delivery integration anywhere (checked — no SMTP/SendGrid/Twilio/etc.),
so a generated OTP has nowhere real to be sent. Silently returning the
code in the API response as if delivery had happened would defeat the
entire point of a second factor — anyone with API access could read it,
same as no OTP at all, just with extra steps. Resolved the same way
`auth_required()` already draws this line everywhere else in the
codebase: the code is only included in the response when
`AGENTOS_AUTH_REQUIRED` is disabled (dev mode), logged as a loud
warning when that happens. With auth required (a real deployment),
`/otp/request` generates and durably stores a real, correctly-expiring
code but returns `otp_code: null` — honestly reflecting that delivery
isn't wired up, rather than a fake success. Whoever wires a real
email/SMS provider later replaces exactly that one gap; the generation/
verification/lockout logic underneath does not need to change.

Verified live: dev mode returns a real code, wrong code 401s, correct
code issues a real JWT + session, the SAME code reused a second time
401s (single-use, matches `OTPStatus.VERIFIED` no longer being
`is_valid`), 3 wrong attempts locks out even the correct 4th-attempt
code (`OTPStatus.FAILED`), production mode (`AGENTOS_AUTH_REQUIRED=true`)
correctly returns `otp_code: null`, and a successfully-verified account's
`active`/`active_sessions` state survives a real restart.

## Alternatives Considered

1. **Build OAuth speculatively** (some generic flow with no real
   provider) — rejected per explicit direction: a real OAuth
   integration needs a real flow (Client Credentials vs Authorization
   Code) and a real provider to target; building either without one is
   guesswork that would need rebuilding anyway once a real requirement
   exists.
2. **Apply `@audited` to all 244 endpoints** — rejected for this pass:
   the same reasoning ADR-009 used for idempotency — most GETs and
   low-risk mutations don't need an audit trail today, and blanket
   coverage can be added incrementally to specific routes as a genuine
   need is identified, rather than instrumenting everything speculatively.
3. **Let SecureKeystore keep silently minting ephemeral keys** — rejected:
   the docstring in `routes/keys.py` already stated the intended
   (fail-fast) behavior; the code just never matched it. Matching the
   documented intent is the safer default for a system that stores raw
   third-party API keys.
4. **Silently return the OTP code in every environment** — rejected: a
   second factor that's readable from the same API call that requested
   it is not a second factor. **Build a real email/SMS provider
   integration just to unblock this** — also rejected: a genuine,
   separate infrastructure decision (which provider, whose API keys,
   whose delivery quota) outside this fix's scope, matching how OAuth
   was deferred earlier in this same gate rather than built
   speculatively.

## Consequences

- API keys stored via `POST /keys` now genuinely survive a restart,
  and a misconfigured deployment (no `KEYSTORE_SECRET`) fails loudly at
  first use instead of silently losing data weeks later.
- Ten security/compliance-sensitive endpoints now produce a real,
  queryable audit trail (success and failure) where previously none
  existed for successful actions at all.
- `@audited` is now available as a reusable primitive (matching
  `@idempotent`) for any future route that needs the same guarantee —
  extending coverage is a one-line addition per route, not new
  infrastructure.
- OAuth remains a deliberate, tracked gap — not silently absent.
- `POST /actors/{id}/login` is now real authentication instead of a
  convincing-looking fake — an integrator building against this API
  today gets an actual security boundary, not false confidence in one.
- This addendum exists because the initial pass checked ONE auth
  surface (`api/dependencies.py`) and treated "authentication: real"
  as fully verified without checking whether other routers under the
  same app also claimed to do authentication. The lesson carried
  forward from Gate 6 (verify claims live, don't just read code) applies
  just as much to "is this the ONLY place that does X" as it does to
  "does X actually work."
