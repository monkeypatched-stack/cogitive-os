# ADR-015: Operations (Gate 8) — A Docker Image That Actually Builds, `/live`

## Status

Accepted

## Context

Auditing "Docker image / Kubernetes manifests / Helm chart / health
endpoints" found real, substantial pre-existing infrastructure —
`docker/services/agentos/Dockerfile`, `docker-compose.yml`,
`deploy/k8s/{deployment,service,configmap,servicemonitor,prometheusrule}.yaml`,
and a real Helm chart (`somatic/charts/monkeybrain/`) — but unlike Gates
5-7, this time the infrastructure had never actually been exercised: the
Dockerfile had never successfully produced a working image. `/health`
and `/ready` already existed (and `/health`'s own docstring already
correctly describes it as a liveness check); `/live` as a literal path
did not.

A same-named but unrelated `somatic/charts/monkey-brain/` chart (hyphen)
initially looked like duplication — it is not: it's a "Constitutional
Compiler" artifact generator (emits `ConstitutionalModule`/
`ConstitutionalPrinciple`/etc. CRD-shaped YAML for architecture-as-code
tooling), a different system entirely, referenced by the `somatic`
umbrella chart for a different purpose. `somatic/charts/monkeybrain/`
(no hyphen) is the real deployment chart and is intentionally standalone
(not part of the umbrella) — confirmed by reading both, not assumed.

## Decision

**`GET /live`** (new, `api/main.py`): the truest possible liveness
signal — depends on nothing beyond the ASGI server routing a request to
a handler and returning, unlike `/health` which (correctly, for its own
stated purpose) still calls `lemon.overall_health()`. `deploy/k8s/
deployment.yaml`'s `livenessProbe` now points at `/live` instead of
`/health`, for the same reason `/health`'s own docstring gives for not
gating liveness on external dependencies — a Lemon-internals problem
is a real but different failure mode than "this process is wedged,"
and conflating the two risks a livenessProbe restart-looping a pod over
something a restart can't fix. Also added a `startupProbe` (`/live`,
30 × 5s = 150s budget) — this session directly observed real boot times
of 30-77s+ (real Mongo/Redis/Neo4j connections, ~295 agents
registered); without it, the existing `livenessProbe` timing
(`initialDelaySeconds: 15` + `failureThreshold: 3` × `periodSeconds: 30`
≈ 105s) could kill a slow-but-healthy pod before it ever finished
booting.

**The Dockerfile did not build.** Found via a real `docker build` (this
session's Docker daemon was not initially running; started it rather
than rely on static reasoning alone, matching this session's standing
"verify live" discipline) — three separate, real bugs, each found by
fixing the previous one and rebuilding:

1. `COPY services/common/` / `COPY services/agentos/` referenced paths
   that don't exist relative to the build context (`context: .`, the
   repo root, per `docker-compose.yml`) — `services/common` and
   `services/agentos` only exist under
   `domains/manufacturing/knowledge/services/` (confirmed: repo-root
   `services/` only contains `services/file/`). Fixed by copying from
   the real path; also added the missing `services/auth/` (grepped:
   `src/monkey_brain` imports from `services.common.*` and
   `services.auth.*`, nothing else under `services.*`).
2. `requirements.txt` was missing `scipy` — `kernel/compile/actor.py`
   imports it directly; it's declared in `pyproject.toml` but the two
   dependency lists had drifted (a full diff found 12 packages present
   in `pyproject.toml` but absent from `requirements.txt`; 10 are the
   local `monkeybrain-*`/`sittingface` packages under `packages/`,
   likely intentionally handled differently — not chased further here,
   flagged as a real open question below).
3. `src/monkey_brain/runtime/runtime.py` does
   `from monkey_brain.runtime.agent_resolver import ...` — a BARE
   import, while most of the codebase uses `from src.monkey_brain....`.
   This works locally because the dev venv's editable install
   (`__editable__.monkeybrain_runtime-*.pth`) puts `src/` ITSELF on
   `sys.path`, not just the repo root — giving both import styles a
   valid resolution simultaneously. The Dockerfile had neither. Fixed
   with `ENV PYTHONPATH=/app:/app/src`, replicating exactly what the
   local editable install already does, rather than rewriting the
   inconsistent import (out of scope — a real code-style cleanup for a
   separate pass, not this gate).
   Also added a missing `COPY monkeypatched_sdk/` (a top-level package,
   sibling to `src/`, that `src/cortex/prediction.py` imports directly).

After all three fixes: a real `docker build` succeeds, and
`docker run ... python -c "from services.agentos.main import app"`
succeeds inside the built image (51 routes registered at import time).
A full `docker run` boot attempt (no real Mongo/Redis/Neo4j reachable
in that standalone container) correctly fails fast — `kernel.py`'s own
documented contract ("Required subsystems... raise RuntimeError on
failure") — which is the CORRECT behavior once real infra is present,
not a new bug.

**`docker-compose.yml` had no Neo4j service at all** — a comment
claimed "neo4j removed — replaced by TensorGraphStore," which does not
match reality: this entire session's real running app connects to Neo4j
on every boot (`SemanticGraph connected to bolt://localhost:7687`,
confirmed repeatedly in logs), and `deploy/k8s/configmap.yaml` already
configures `NEO4J_URI`/`NEO4J_USER`/`NEO4J_PASSWORD` for exactly this —
the compose file was simply never updated to match. Added a real
`neo4j:5-community` service with a healthcheck, wired `agentos`'s
`environment`/`depends_on` to it, matching the k8s configmap's
connection details exactly. Validated with `docker compose config`.

## Alternatives Considered

1. **Rewrite `runtime.py`'s bare import to `src.monkey_brain....`
   instead of adding `PYTHONPATH`** — rejected for this pass: the
   `PYTHONPATH` fix replicates the SAME resolution the local dev
   environment already relies on (an intentional editable-install
   choice, not an accident) and fixes it in one place for every present
   and future instance of the same pattern, rather than chasing
   individual inconsistent imports one at a time — some of which may
   exist elsewhere and weren't hit by this specific import chain.
2. **Add the 10 missing local `monkeybrain-*`/`sittingface` packages to
   `requirements.txt` too** — deferred, not fixed: these are local
   editable packages under `packages/`, not real PyPI packages;
   `requirements.txt` (a flat `pip install -r` file) may not even be
   the right mechanism for them, and getting that wrong risks a
   different, more confusing build failure than the one just fixed.
   Flagged as a real open question rather than guessed at.
3. **Merge the two `somatic/charts/monkey(-)?brain/` charts** — rejected:
   confirmed live (reading both, and the umbrella's own dependency
   list) that they serve genuinely different purposes; "merging" them
   would be actively wrong, not a cleanup.

**Helm chart** (`somatic/charts/monkeybrain/templates/services.yaml`): this
single template is shared by all 24 services (`values.yaml`'s
`services.*` map), and only agentos's `main.py` actually has a `/live`
route — every other service (auth, orders, inventory, ...) only has
`/health`. Blanket-switching the shared template's `livenessProbe` path
to `/live` would have 404-restart-looped every non-agentos pod. Instead
made the path per-service-configurable (`livenessPath`, defaulting to
`/health`) and set `livenessPath: /live` only on the `agentos` entry in
`values.yaml`.

## Consequences

- `docker build -f docker/services/agentos/Dockerfile .` now produces a
  real, importable image — confirmed by an actual build+run, not static
  reading. Previously, this command could not have succeeded for
  anyone, ever, since the Dockerfile was originally authored.
- `docker-compose up agentos` can now actually reach a real Neo4j; the
  compose file's own comment claiming otherwise was simply wrong.
- Kubernetes liveness/startup probes now match this session's directly-
  observed real boot-time behavior instead of assumed-fast defaults.
- The `requirements.txt` / `pyproject.toml` drift for the 10 local
  packages remains a real, tracked, unresolved question — not silently
  papered over by guessing at a fix.
