# API Examples

Real request/response pairs, captured live against a running server
(`localhost:8031`) on 2026-08-03. Every response below is unedited
output from an actual call — not hand-written sample data. Full route
list: [`docs/openapi.json`](openapi.json) or `GET /docs`.

## Health & liveness (Gate 8)

```bash
curl http://localhost:8031/live
```
```json
{"status": "alive"}
```

```bash
curl http://localhost:8031/health
```
```json
{
  "status": "healthy",
  "service": "monkeybrain-runtime",
  "health": "healthy",
  "checks": {
    "mongodb": {"status": "healthy"},
    "redis": {"status": "healthy"},
    "mem0": {"status": "disconnected"},
    "runtime": {"status": "healthy"},
    "policy": {"status": "healthy"}
  }
}
```
`mem0` shows `disconnected` here — that's a real, non-fatal degraded
dependency, not a bug; `/health` still reports overall `healthy`
because mem0 isn't in the required-subsystem set. See
[`troubleshooting.md`](troubleshooting.md#health-shows-a-disconnected-check).

```bash
curl http://localhost:8031/ready
```
```json
{"ready": true, "health": "healthy", "service": "monkeybrain-runtime"}
```

## Actors

```bash
curl -X POST http://localhost:8031/api/v1/agentos/actors \
  -H "Content-Type: application/json" \
  -d '{"name":"DocsExampleActor","actor_type":"robot","goals":["deliver_package"],"capabilities":[{"name":"general"}]}'
```
```json
{
  "actor_id": "960d4dd62c2745e49547a5f9b369a3d6",
  "name": "DocsExampleActor",
  "actor_type": "robot",
  "description": "",
  "status": "registered",
  "cycle_count": 0,
  "is_active": true,
  "societies": [],
  "goals": ["deliver_package"],
  "policies": [],
  "objective": "",
  "trust_level": 0.5,
  "ownership": ""
}
```

```bash
curl http://localhost:8031/api/v1/agentos/actors
```
Returns a JSON array; one element shown:
```json
{
  "actor_id": "b479490c828943dd9ac4a8753360c708",
  "name": "Updated Name",
  "actor_type": "robot",
  "status": "initialized",
  "cycle_count": 16,
  "is_active": true,
  "societies": ["1af725afef8946f8bb734a199d7726c3"],
  "goals": ["deliver_package"],
  "trust_level": 0.8
}
```

## Societies

```bash
curl http://localhost:8031/api/v1/agentos/societies
```
```json
{
  "society_id": "1af725afef8946f8bb734a199d7726c3",
  "name": "Planetary Society",
  "society_type": "generic",
  "actor_count": 11,
  "active_actors": 0,
  "tick_count": 16,
  "is_active": true
}
```

## Planetary cycle (Gate 9)

```bash
curl -X POST http://localhost:8031/api/v1/agentos/planet/tick
```
This is a real, expensive, state-advancing operation — see
[`troubleshooting.md`](troubleshooting.md#planet-tick-is-slow-or-times-out)
before scripting repeated calls to it. Response shape:
```json
{"cycle": 8, "societies_ticked": 22, "actors_observed": 11,
 "interactions_routed": 0, "context_events_published": 53,
 "duration_ms": 89854.9}
```
(`duration_ms` from a live capture — see the troubleshooting entry for
why this is tens of seconds, not milliseconds.)

## Authentication (Gate 7)

```bash
curl -X PUT http://localhost:8031/api/v1/actors/{actor_id}/account \
  -H "Content-Type: application/json" \
  -d '{"email":"docs-example@example.com","password":"DocsExample!2026"}'
```
```json
{"status": "updated", "actor_id": "960d4dd62c2745e49547a5f9b369a3d6",
 "fields_updated": ["email", "password"]}
```

```bash
curl -X POST http://localhost:8031/api/v1/actors/{actor_id}/login \
  -H "Content-Type: application/json" \
  -d '{"email":"docs-example@example.com","password":"DocsExample!2026"}'
```
```json
{"access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 "token_type": "bearer", "expires_in": 3600}
```
Wrong password on the same account:
```bash
curl -X POST http://localhost:8031/api/v1/actors/{actor_id}/login \
  -d '{"email":"docs-example@example.com","password":"wrong"}'
```
```json
{"detail": "Invalid email or password"}
```
`HTTP 401`. Five consecutive failures locks the account for 30 minutes
(`HTTP 423`) — see [`troubleshooting.md`](troubleshooting.md#login-returns-423-locked).
OTP flow: `POST /api/v1/actors/{actor_id}/otp/request` then
`POST /api/v1/actors/{actor_id}/otp/verify` — the request response only
includes the raw `otp_code` when `AGENTOS_AUTH_REQUIRED` is unset/false
(dev mode); production mode returns `otp_code: null` since there is no
real delivery channel wired up (see ADR-014).

## Secrets (Gate 7)

```bash
curl -X POST http://localhost:8031/api/v1/agentos/keys \
  -H "Content-Type: application/json" \
  -d '{"service":"docs-example","key_name":"example-key","api_key":"sk-example-not-a-real-secret"}'
```
```json
{"key_id": "f56d48bb-d9f2-470b-a218-35da1800aba9", "user_id": "anonymous",
 "service": "docs-example", "key_name": "example-key", "api_url": "",
 "created_at": "2026-08-03T07:44:46.995196+00:00", "is_active": true}
```
Returns `503` if the server was started without `KEYSTORE_SECRET` — see
[`troubleshooting.md`](troubleshooting.md#keys-endpoints-return-503-keystore-unavailable).

## Observability (Gate 5)

```bash
curl http://localhost:8031/api/v1/agentos/observability
```
```json
{
  "summary": {
    "health": {"overall": "healthy", "total_checks": 5},
    "metrics": {"counters": 2, "gauges": 30},
    "tracing": {"total_traces": 1}
  },
  "metrics": {
    "gauges": {
      "pipeline.planner_latency_ms:": 1.35,
      "pipeline.execution_latency_ms:": 0.99,
      "planetary.cycle_duration_ms:": 89854.9
    }
  }
}
```
Note the route is under `/api/v1/agentos/observability`, not the bare
`/observability` you might expect by analogy with `/health`/`/ready` —
a real, live-confirmed gotcha (bare `/observability` 404s).
