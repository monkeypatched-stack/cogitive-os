# SPIFFE/SPIRE Workload Identity

Cryptographic identity for CognitiveOS agents/workloads, sitting
underneath — never replacing — the existing governance stack:

```
authenticated request -> authorization -> OPA/governance policy
    -> ApprovalDecision -> ApprovalArtifact/HITL handoff
    -> runtime execution gate -> execution
```

SPIFFE/SPIRE answers **who is this workload**. It never answers **what may
it do** — that remains `GovernanceEngine` + OPA
(`opa/policies/agentos_governance.rego`), and a granted authorization is
still recorded exclusively as an `ApprovalArtifact`
(`kernel/approval.py`).

## Trust domain

One configurable value, `SPIFFE_TRUST_DOMAIN`, read by
`kernel/workload_identity.py::configured_trust_domain()` (default
`cognitiveos.local`) and by `services/common/pipeline_attestation.py`'s
existing pipeline-step identity scheme — both agree on the same trust
domain rather than hard-coding it twice.

**Local development** (`docker-compose.spire.yml`): `cognitiveos-dev.local`.
**Production** (`deploy/k8s/configmap.yaml`): `cognitiveos.production`.

These must never be equal. A dev-issued SVID's trust domain component
cannot even parse as belonging to production, let alone verify against
its trust bundle — so a leaked/cloned dev certificate is inert against a
production SPIRE Server by construction, not by a runtime check that
could be bypassed.

## Identity model

```
spiffe://<trust-domain>/agent/<agent-id>
```

e.g. `spiffe://cognitiveos.local/agent/lending-decision` —
`kernel/workload_identity.py::agent_spiffe_id()`. Pipeline-step workloads
use the existing, separate
`spiffe://<trust-domain>/pipeline/<id>/step/<step>/agent/<role>` scheme
(`services/common/pipeline_attestation.py::canonical_spiffe_id`, unchanged
by this work — a different identity *class*, not duplicated logic).

This string is **never** itself proof of anything — it is the name a
SPIRE registration entry is created under. Proof comes only from a real
X.509-SVID fetched over the Workload API.

## SPIRE Server / Agent

Standard, unmodified upstream SPIRE (`ghcr.io/spiffe/spire-server`,
`ghcr.io/spiffe/spire-agent`) — no custom CA, no custom issuance, no
custom rotation logic anywhere in this repo.

```
                    SPIRE Server
                         │
                  Trust Domain CA (SPIRE's own, or upstream_ca
                         │          chained to a real org root)
                ┌────────┴────────┐
                │                 │
          SPIRE Agent A      SPIRE Agent B
                │                 │
          Workload A         Workload B
                │                 │
             X.509-SVID       X.509-SVID
```

- **Local dev**: `docker-compose.spire.yml` (`spire-server` + `spire-agent`
  containers, `join_token` node attestation, `docker` workload attestor
  matching container labels). Register entries with
  `deploy/spire/register-entries.sh`.
- **Kubernetes**: `deploy/k8s/spire-server.yaml` (StatefulSet, `k8s_psat`
  node attestation — validates each Node's real Projected Service Account
  Token via the Kubernetes TokenReview API) +
  `deploy/k8s/spire-agent.yaml` (DaemonSet, one per Node, `k8s` workload
  attestor).

## Workload registration / selectors

**Narrowest selector, never a shared identity** (Phase 4's own words):

| Workload | Selector | Resulting identity |
|---|---|---|
| `agentos` control plane | `k8s:ns:monkeybrain` + `k8s:sa:agentos` (or the existing `k8s:pod-label` if you'd rather not add a new ServiceAccount) | `spiffe://<domain>/agent/agentos` |
| Per-actor Pod (`deploy/k8s/actor-deployment.yaml`) | `k8s:pod-label:actor-id:<value>` — **the pod label this template already sets**, zero manifest changes needed | `spiffe://<domain>/agent/<actor-id>` |

Today, every rendered `actor-deployment.yaml` Pod shares one
ServiceAccount (`cognitiveos-actor-provisioner`, used only for the
Kubernetes-provisioner RBAC — see that file's own comments). SPIRE
registration deliberately selects on the **pod label**
(`actor-id: "${ACTOR_ID}"`), not the ServiceAccount, so each actor still
gets its own distinct SPIFFE identity without needing a new
ServiceAccount per actor.

## SVID issuance / rotation / expiration

Entirely SPIRE's job. `kernel/workload_identity.py::WorkloadIdentityProvider`
fetches whatever the Workload API currently holds on each call — it does
not cache a stale SVID indefinitely, and it implements no rotation logic
of its own (Phase 19: "verify what SPIRE provides automatically and use
it"). A long-lived process that needs a fresh identity across a long
lifetime should re-fetch (a new `WorkloadIdentityProvider()` or a direct
`get_x509_svid()` call) rather than hold one instance forever.

## mTLS

This repo already has an mTLS integration point:
`MTLSMiddleware`/`services/common/cert_token_binding.py`, designed for TLS
**terminated at a reverse proxy** (nginx/Envoy) which forwards the
verified client certificate via header
(`X-Client-Cert`/`request.state.mtls_cert`); `get_principal_with_cert_binding`
then checks the cert's SAN against the JWT `sub`/`spiffe_id` claim.

SPIRE fits this exact pattern: point the terminating proxy's own TLS
material at a SPIRE-issued SVID (Envoy's native SPIFFE support, or
`spiffe-helper` writing rotated cert/key/bundle files nginx reads) instead
of a static cert. This repo does not rewrite that middleware — it is
already the mTLS integration point, `MTLS_ENABLED=false` by default
(`.env.example`), unchanged by this work.

For the two **actual agent-to-agent paths** discovered this session that
have no proxy in front of them at all:

- `kernel/domains/grocery.py::subscribe_actor_inbox`'s NATS `_on_message`
  (in-process/NATS transport, no network TLS to speak of)
- `actor_runtime.py`'s per-Pod `POST /execute` (a real cross-Pod HTTP
  call today authenticated only by a shared-secret header,
  `require_internal_service_token`)

both now call `WorkloadIdentityProvider.get_current_identity()` first and
bind a real, verified `TrustedAuthEvidence` (`evidence_from_spiffe`) when
available. Full wire-level mutual TLS on the `actor_runtime.py` HTTP path
(uvicorn `--ssl-certfile`/`--ssl-keyfile`/`--ssl-ca-certs`/
`--ssl-cert-reqs=CERT_REQUIRED`, fed by a `spiffe-helper` sidecar writing
rotated files) is documented here as the correct next step but not
force-enabled on the existing, already-tuned `actor-deployment.yaml` — see
"Enabling SPIFFE on an existing Deployment" below.

## Identity mapping: SPIFFE ID → CognitiveOS principal → authorization

```
SPIFFE ID (verified X.509-SVID)
    ↓  WorkloadIdentityProvider.get_current_identity()
WorkloadIdentity (kernel/workload_identity.py)
    ↓  evidence_from_spiffe()
TrustedAuthEvidence (kernel/trusted_auth.py) — spiffe_id, spiffe_verified
    ↓  build_opa_input() / GovernanceEngine.evaluate()
OPA decision: AUTO_APPROVE / HUMAN_APPROVAL_REQUIRED / DENY
```

An authentic `spiffe://cognitiveos.local/agent/lending-decision` proves
**that workload is genuinely running** — it grants nothing by itself.
`opa/policies/agentos_governance.rego`'s new, purely additive
`allowed_recipients` data (Phase 12) can restrict which recipients a
given sender SPIFFE ID may address; absent that data, every sender may
address any recipient — today's exact behavior, unchanged.

## Failure behavior

| Condition | Behavior |
|---|---|
| No `SPIFFE_ENDPOINT_SOCKET` configured | `get_current_identity()` returns `None` — falls back to existing non-SPIFFE evidence (dev), or refused (production / `COGNITIVEOS_REQUIRE_SPIFFE_AGENT_IDENTITY=true`) |
| SPIRE Agent unreachable | Same as above — `fetch_svid()` never raises out to a caller |
| `SPIFFE_ID` env override set **and** `COGNITIVEOS_PRODUCTION_MODE=true` | Refused outright, loudly logged (the real gap this work closed — the override previously had no production guard at all) |
| `SPIFFE_ID` env override set without explicit `COGNITIVEOS_ALLOW_INSECURE_DEV_MODE` | Refused |
| OPA unreachable/erroring | `DENY` — unchanged, pre-existing `GovernanceEngine`/`services.common.opa` behavior |

## Revocation / compromise

SPIRE has no separate "revoke this one SVID" primitive by design — a
compromised workload's identity is contained by:

1. Removing/disabling its SPIRE **registration entry** (an operator
   action, `spire-server entry delete`) — the workload can no longer
   obtain a *new* SVID once its current one expires (SVIDs here are
   short-lived; there is nothing to wait out for long).
2. Terminating the workload — a replacement workload does not
   automatically inherit the old identity; it must independently satisfy
   the SAME attestation selectors from scratch.
3. **Independently**, OPA can disable a principal (`denied_runtimes`/
   `denied_actions`/`charters` in `agentos_governance.rego`, or the new
   `allowed_recipients`) even while its certificate remains
   cryptographically valid until natural expiry — `certificate valid ≠
   authorization valid` is enforced by keeping these as two genuinely
   separate checks (`WorkloadIdentity.is_cryptographically_verified` vs.
   `GovernanceEngine.evaluate()`'s own, independent decision).

## Development vs. production

| | Local dev | Production |
|---|---|---|
| Trust domain | `cognitiveos-dev.local` | `cognitiveos.production` |
| Node attestation | `join_token` | `k8s_psat` |
| Workload attestation | `docker` (container labels) | `k8s` (namespace/ServiceAccount/pod labels) |
| `SPIFFE_ID` env override | Permitted only with explicit `COGNITIVEOS_ALLOW_INSECURE_DEV_MODE=true` | Always refused when `COGNITIVEOS_PRODUCTION_MODE=true`, regardless of any other flag |
| Agent communication without a verified identity | Falls back to existing service-name evidence (unchanged default) | Always refused (Non-negotiable rule 12), independent of `COGNITIVEOS_REQUIRE_SPIFFE_AGENT_IDENTITY` |

## How a new CognitiveOS agent receives its identity

```
Deploy Agent (render actor-deployment.yaml for ACTOR_ID=alice)
    ↓
Kubernetes schedules the Pod — labeled actor-id: "alice" (already in the template)
    ↓
kubelet issues the Pod's Projected Service Account Token
    ↓
spire-agent (DaemonSet on that Node) attests the Node via k8s_psat
    ↓
Pod calls the Workload API socket -> spire-agent's k8s WorkloadAttestor
    matches its pod-label selector (actor-id:alice) against a registered entry
    ↓
X.509-SVID issued: spiffe://cognitiveos.production/agent/alice
    ↓
kernel/workload_identity.py::WorkloadIdentityProvider.get_current_identity()
    ↓
kernel/trusted_auth.py::evidence_from_spiffe() -> TrustedAuthEvidence
    ↓
build_opa_input() -> GovernanceEngine.evaluate() -> AUTO_APPROVE / HUMAN / DENY
    ↓
ensure_governed()'s execution gate, ApprovalArtifact, AuditLog — all unchanged
```

## Enabling SPIFFE on an existing Deployment

Not applied automatically to `deploy/k8s/deployment.yaml`/
`actor-deployment.yaml` by this work (they are production-tuned manifests
this change does not silently alter). To enable:

```yaml
volumes:
  - name: spire-agent-socket
    hostPath: {path: /run/spire/sockets, type: Directory}
containers:
  - name: agentos   # or cognitiveos-actor
    volumeMounts:
      - {name: spire-agent-socket, mountPath: /run/spire/sockets, readOnly: true}
    env:
      - {name: SPIFFE_ENDPOINT_SOCKET, value: "/run/spire/sockets/agent.sock"}
```

plus registering that Pod's selector with `spire-server entry create` (see
`deploy/spire/register-entries.sh` for the local-dev equivalent) and, once
verified working, flipping `COGNITIVEOS_REQUIRE_SPIFFE_AGENT_IDENTITY=true`
in `deploy/k8s/configmap.yaml` to make the refusal path mandatory even
outside production mode.

## Agent distribution / marketplace

An agent **package** (code + manifest + declared capabilities) never
contains a production SPIFFE identity — there is nothing in this
identity layer for a package to embed: the actual `spiffe://.../agent/<id>`
a deployed instance receives comes entirely from the deploying
environment's own SPIRE registration (namespace/ServiceAccount/pod-label
selectors), decided at deploy time, not baked into the package. Cloning a
package and deploying two copies produces two Pods with two different
pod labels (or none, if misconfigured) — SPIRE simply issues no identity
to the second copy until an operator registers it, rather than the clone
inheriting the original's identity.
