# Deployment Guide

Covers the three real deployment paths for `agentos` (MonkeyBrain
runtime, port 8031): Docker Compose (local/dev), a raw Kubernetes
manifest, and the Helm chart. All three were built or fixed and
live-verified in Gate 8 (ADR-015) — this guide reflects what was
actually run, not what's assumed to work.

## Prerequisites

Real, required dependencies (confirmed via live boot logs all
session — `Kernel` raises `RuntimeError` and fails fast if any are
unreachable, per its documented contract):

- MongoDB
- Redis
- Neo4j (bolt://...:7687) — `docker-compose.yml` had NO Neo4j service
  until Gate 8; a stale comment claimed it was "replaced by
  TensorGraphStore," which didn't match reality (confirmed via boot
  logs: `SemanticGraph connected to bolt://localhost:7687` on every run)

Optional/degraded-if-absent: NATS, InfluxDB, Elasticsearch (audit
sink), OPA, mem0.

## Local: Docker Compose

```bash
docker compose up agentos
```

Brings up `mongodb`, `redis`, `neo4j`, `nats`, `influxdb`, `opa`, and
`agentos` with real `depends_on: condition: service_healthy` gating.
`agentos`'s Dockerfile (`docker/services/agentos/Dockerfile`) required
three real fixes in Gate 8 before it would build at all:

1. `COPY services/common/` / `COPY services/agentos/` pointed at paths
   that don't exist relative to the repo-root build context — the real
   location is `domains/manufacturing/knowledge/services/`.
2. `requirements.txt` was missing `scipy` (imported directly by
   `kernel/compile/actor.py`).
3. Bare imports (`from monkey_brain.runtime... import`, no `src.`
   prefix) only resolve locally because the dev venv's editable install
   puts `src/` itself on `sys.path`; the image needed
   `ENV PYTHONPATH=/app:/app/src` to replicate that.

If you're building this image from scratch elsewhere and it fails, it
is almost certainly one of these three — check `docs/adr/015-operations-gate8.md`
for the full diagnosis before assuming it's a new issue.

## Kubernetes: raw manifests

```bash
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/service.yaml
kubectl apply -f deploy/k8s/servicemonitor.yaml   # if Prometheus Operator is installed
kubectl apply -f deploy/k8s/prometheusrule.yaml   # if Prometheus Operator is installed
```

`deployment.yaml`'s three probes, tuned from real observed behavior
(Gate 8):

| Probe | Path | Why |
|---|---|---|
| `livenessProbe` | `/live` | Zero-dependency check — restarts a truly wedged process without restart-looping over a transient Lemon/dependency hiccup (that's what `/health` is for, separately). |
| `readinessProbe` | `/ready` | Gates traffic on real dependency health. |
| `startupProbe` | `/live`, 30×5s=150s budget | Real boot times of 30-77s+ were observed this session (real Mongo/Redis/Neo4j connections, ~295 agents registered) — without this, the tight `livenessProbe` timing could kill a slow-but-healthy pod mid-boot. |

## Helm

```bash
helm install monkeybrain somatic/charts/monkeybrain \
  --set services.agentos.enabled=true
```

Two charts share the word "monkeybrain" in this repo and are **not**
duplicates — don't merge them:

- `somatic/charts/monkeybrain/` (no hyphen) — the real deployment
  chart used above.
- `somatic/charts/monkey-brain/` (hyphen) — an unrelated
  "Constitutional Compiler" artifact generator that emits
  `ConstitutionalModule`/`ConstitutionalPrinciple` CRD-shaped YAML for
  architecture-as-code documentation. Referenced by the `somatic`
  umbrella chart for a different purpose entirely.

The real chart's `templates/services.yaml` is shared across all 23
services in `values.yaml`'s `services.*` map (re-verified 2026-08-26;
was previously stated as 24) — only `agentos` has a
real `/live` endpoint, so the liveness path is per-service-configurable
(`livenessPath`, defaulting to `/health`) rather than a blanket switch,
which would 404-restart-loop every other service.

## Post-deploy sanity check

```bash
curl $HOST/live      # {"status": "alive"}
curl $HOST/ready     # {"ready": true, "health": "healthy", ...}
curl $HOST/health    # per-dependency breakdown
```

Then see [`troubleshooting.md`](troubleshooting.md) for anything that
doesn't look right, and [`examples.md`](examples.md) for what a healthy
core API surface looks like.
