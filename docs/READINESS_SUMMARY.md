# Cognitive OS — Readiness Summary

**Date:** 2026-09-01  
**Branch:** `review`  
**Latest CI:** [All jobs passing](https://github.com/monkeypatched-stack/cognitive-os/actions) (lint, test, architecture, actor-artifact-build, docker-image-security-gates)

---

## Executive verdict

| Profile | Ready? | Notes |
|---------|--------|-------|
| **Single-replica staging** with production gates, Redis, OPA, Kong, idempotency keys | **Yes** | Hardened baseline; monitor closely |
| **Single-replica production** (low traffic, controlled rollout) | **Conditional** | Requires secrets management, ADR-020 auth/payment P0s reviewed |
| **Multi-replica / HA production** | **No** | Lifecycle fixes landed; chaos/soak under `replicas > 1` not complete |
| **CI merge gate** | **Yes** | Curated regression bundle + architecture conformance green |
| **Container artifact pipeline** | **Yes** | Actor image builds; secret scan passes (soft gate — see CI notes) |

The system is **materially production-hardened for a controlled single-replica deploy** when configuration below is applied. It is **not** a claim of unconstrained multi-instance or full adversarial clearance.

---

## What is ready

### 1. CI/CD (GitHub Actions)

| Job | Status | What it gates |
|-----|--------|---------------|
| `lint` | ✅ Hard gate | Ruff syntax (`E9`) on `src/`, `tests/`, `scripts/` |
| `test` | ✅ Hard gate | ~178-test curated bundle (~3 min): architecture waves, production gates, gateway boundary, idempotency, world validator, scale tiers |
| `architecture` | ✅ Hard gate | `check_architecture_conformance.py --strict` + wave regression tests |
| `typecheck` | ⚠️ Report-only | `mypy` with `continue-on-error` — visible, not blocking |
| `actor-artifact-build` | ✅ Passing | Builds `cognitiveos-actor:<sha>`, smoke-imports `actor_runtime`, secret scan |
| `docker-image-security-gates` | ✅ Passing | Builds auth / file / agentos images; `verify_image_secrets.py` on each |

**Recent CI fixes (2026-08-31):** `pytest-asyncio` for async tests; auth/file Dockerfile `COPY` paths; image secret scanner (`docker create` + `export`); CA-bundle false-positive exclusions.

### 2. API gateway boundary (Kong)

- **Single north-south HTTP entry:** Kong `:8000` (`kong/kong.yml`, `docker-compose.yml`)
- **AgentOS + domain services** routed through Kong; LLM egress via `/api/v1/llm/*`
- **Enforcement:** `API_GATEWAY_REQUIRED` (Kong correlation ID), `X-Internal-Service-Token` on actor `POST /execute`
- **K8s:** `deploy/k8s/kong.yaml` LoadBalancer; network policies lock down direct backend access
- **Clients:** `cogctl`, Postman collection, `living-world-explorer` proxy → `:8000`

See `docs/API_GATEWAY.md`.

### 3. Production runtime gates

Central module: `src/monkey_brain/kernel/production_gates.py`

| Gate | Trigger | Effect |
|------|---------|--------|
| Production mode | `COGNITIVEOS_PRODUCTION_MODE=true` | Master switch for gates below |
| Redis required | production mode / `REQUIRE_REDIS` | Boot fails without Redis |
| OPA required | production mode / `OPA_REQUIRED` | Governance denies without `OPA_URL` |
| Idempotency fail-closed | production mode | HTTP 503 if idempotency store unavailable |
| World API block | production mode | `POST/PUT/DELETE` on `/world/*` CRUD → 403 |
| Capability dispatch dedup | production mode | Redis claim before `handle()` |
| API gateway boundary | production mode / `API_GATEWAY_REQUIRED` | Reject without `X-Kong-Request-Id` |

**Client requirements:** `Idempotency-Key` on `POST /prompt`, `/plan`, `/execute`; commerce via `/commerce` routes, not SharedWorld CRUD.

See `docs/PRODUCTION_HARDENING_SUMMARY.md` for implementation detail.

### 4. Multi-replica safety (tier 2)

- Lease fencing + stale belief checkpoint skip
- Reconcile lease staleness fix; `resident_here` narrowed; ghost migration guard
- Capability timeout (`CAPABILITY_TIMEOUT_SECONDS`, default 120s)
- HTTP idempotency on plan/execute; execution graph forwarding fixed

Covered by `tests/unit/test_production_gates.py`, `tests/unit/test_multi_replica_safety.py`.

### 5. Docker security

- `.dockerignore` excludes `.env`, keys, credentials from build context
- `scripts/verify_image_secrets.py` scans built images in CI
- Auth Dockerfile strips `services/auth/.env`; paths aligned with `domains/manufacturing/knowledge/services/`

See `docs/DOCKER_SECURITY_SECRETS_GATE.md`.

### 6. Test coverage (CI-gated)

```
Architecture waves 1–6          ✅
Gate 3 world validation         ✅
World validator / idempotency   ✅
API gateway boundary            ✅
Internal auth (actor execute)   ✅
Production gates                ✅
Multi-replica safety            ✅
Actor scale (10 / 100 / 1k)     ✅
```

Full suite (4000+ tests) is local/optional; integration paths need `RUN_INTEGRATION=1`.

---

## Recommended deploy configuration

```yaml
# Representative — see deploy/k8s/configmap.yaml, deploy/k8s/secret.yaml
COGNITIVEOS_PRODUCTION_MODE: "true"
API_GATEWAY_REQUIRED: "true"
OPA_URL: "http://opa:8181"
REDIS_HOST: "redis"
REDIS_PORT: "6379"
KONG_PROXY_URL: "http://kong:8000"
ACCESS_TOKEN_SECRET: "<from-secret>"
REFRESH_TOKEN_SECRET: "<from-secret>"
INTERNAL_SERVICE_TOKEN: "<from-secret>"
CAPABILITY_TIMEOUT_SECONDS: "120"
```

**Traffic path:** Clients → Kong `:8000` → internal services (`agentos:8031`, `auth:8010`, …). Do not expose backend ports publicly.

**Smoke after deploy:**

```bash
curl -s http://<kong>/health
curl -s -H "X-Kong-Request-Id: smoke-$(date +%s)" http://<kong>/api/v1/agentos/health
cogctl get actors   # COGCTL_API_URL=http://<kong>/api/v1/agentos
```

---

## Not ready / known gaps

| Area | Risk | Status |
|------|------|--------|
| Multi-replica K8s soak & chaos | High | `replicas: 1` in manifests; no split-brain chaos suite in CI |
| At-least-once execution attempts require idempotent effects | High | Capabilities at-least-once, never exactly-once; callers must be idempotent |
| ADR-020 auth/payment P0s | High | Wallet CAS races, checkpoint-resume traps — see `docs/adr/020-production-hardening-audit.md` |
| `world.py` vs knowledge_graph dual authority | Medium | Production blocks SharedWorld CRUD only |
| TransitionGate coverage | Medium | Not all grocery capabilities wired |
| Full Mongo/KG write fencing | Medium | Fence on belief checkpoint, not all writes |
| mypy / full unit suite | Low | Typecheck report-only; 4000+ tests not in CI |
| Docker CI jobs | Low | Still `continue-on-error: true` — passing but soft gates |

### Open validation todos

- [ ] sustained multi-node operation
- [ ] operational failure modes
- [ ] upgrade paths
- [ ] security under hostile conditions
- [ ] performance at realistic actor counts
- [ ] deployment reproducibility
- [ ] resource consumption
- [ ] LLM/provider failure behavior

---

## Go / no-go checklist

Before promoting to production:

- [ ] `COGNITIVEOS_PRODUCTION_MODE=true` and all production gates configured
- [ ] Secrets in K8s Secret / vault — not in images or `.env` in repo
- [ ] Kong is the only public HTTP entry; network policies applied
- [ ] Redis and OPA reachable from AgentOS
- [ ] Clients send `Idempotency-Key` on mutating routes
- [ ] ADR-020 P0 items reviewed and accepted or mitigated
- [ ] Monitoring: `/health`, `/ready`, `/metrics`, Kong access logs
- [ ] Rollback plan and single-replica validation in staging complete

---

## Key artifacts

| Artifact | Location |
|----------|----------|
| Kong config | `kong/kong.yml` |
| Gateway middleware | `src/monkey_brain/api/gateway_boundary.py` |
| Production gates | `src/monkey_brain/kernel/production_gates.py` |
| Actor runtime | `src/monkey_brain/actor_runtime.py` |
| CI workflow | `.github/workflows/ci.yml` |
| Architecture CI | `.github/workflows/architecture-conformance.yml` |
| K8s manifests | `deploy/k8s/` |
| Postman collection | `MonkeyBrain_2.0_Runtime_Gateway.postman_collection.json` |

---

## Related documents

| Document | Purpose |
|----------|---------|
| `docs/PRODUCTION_HARDENING_SUMMARY.md` | Deep dive on P0 fixes and tier-2 hardening |
| `docs/API_GATEWAY.md` | Kong routing, enforcement layers, examples |
| `docs/adr/020-production-hardening-audit.md` | Adversarial audit, remaining P0 findings |
| `docs/DOCKER_SECURITY_SECRETS_GATE.md` | Image secret scanning |
| `docs/ACTOR_ARTIFACT.md` | Actor container model |
| `docs/HORIZONTAL_SCHEDULER_SCALING.md` | Multi-node scheduler design |
| `docs/adr/009-idempotency-for-mutating-endpoints.md` | Idempotency design |
| `docs/adr/011-actor-registration-on2-fix.md` | Scale test baselines |

---

## Summary statement

**Cognitive OS on `review` is ready for a gated staging or single-replica production pilot** when Kong, Redis, OPA, production gates, and client idempotency are configured. **Multi-replica HA and full ADR-020 clearance remain out of scope** for this readiness line. CI is green on the curated regression and container security paths; treat mypy and the full 4000+ test suite as follow-up hardening, not blockers for the pilot profile above.
