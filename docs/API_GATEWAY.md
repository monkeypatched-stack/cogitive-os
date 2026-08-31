# API Gateway (Kong)

Kong is the **single north-south HTTP boundary** for AgentOS and the
manufacturing domain microservices. External clients, operators, `cogctl`,
and UIs enter through Kong — not by calling backend service ports directly.

```
INTERNET / CLIENTS
        │
        ▼
┌───────────────────┐
│   Kong (:8000)    │  API Gateway + LLM Gateway
│  kong/kong.yml    │
└─────────┬─────────┘
          │
    ┌─────┴─────┬──────────────┐
    ▼           ▼              ▼
 agentos     auth-service   domain services
 :8031       :8010           :8011–8032
 (internal)  (internal)      (internal)
```

## Entry points

| Environment | External URL | Config |
|-------------|--------------|--------|
| Docker Compose | `http://localhost:8000` | `docker compose up` (includes `kong` service) |
| Kubernetes | `http://<kong-proxy LoadBalancer>/` | `deploy/k8s/kong.yaml` |
| cogctl | `http://localhost:8000/api/v1/agentos` | `COGCTL_API_URL` (default) |
| living-world-explorer | proxied via Vite → `:8000` | `VITE_API_PROXY` optional override |

Direct access to `agentos:8031` or per-actor `:8051` is **internal only**.

## Routed surfaces

### AgentOS (Cognitive OS)

| Kong path prefix | Upstream | Notes |
|------------------|----------|-------|
| `/api/v1/agentos` | `agentos:8031` | World model, cognition, control plane |
| `/api/v1/codegen` | `agentos:8031` | Code generation |
| `/api/v1/knowledge-graph` | `agentos:8031` | Knowledge graph |
| `/api/v1/actors` | `agentos:8031` | Actor profile/login (non-agentos prefix) |
| `/health`, `/live`, `/ready` | `agentos:8031` | Probes (also reachable in-cluster) |
| `/metrics` | `agentos:8031` | Prometheus scrape via Kong or in-cluster |

### LLM Gateway

Centralized model-provider egress. Clients call Kong; provider API keys
should be injected at the gateway in production (not embedded in apps).

| Kong path prefix | Upstream |
|------------------|----------|
| `/api/v1/llm/openrouter` | `https://openrouter.ai/api` |
| `/api/v1/llm/openai` | `https://api.openai.com` |
| `/api/v1/llm/anthropic` | `https://api.anthropic.com` |
| `/api/v1/llm/ollama` | `http://host.docker.internal:11434` (local dev) |

Example: `POST /api/v1/llm/openrouter/v1/chat/completions` → OpenRouter.

### Manufacturing domain

All services in `kong/kong.yml` under `auth-service`, `orders-service`,
`inventory-service`, etc. map to docker-compose service names and ports
(`auth:8010`, `orders:8018`, …).

## Enforcement layers

1. **Kong** — CORS, rate limiting (`3000/min` global), correlation IDs,
   routing, LLM egress boundary.
2. **`API_GATEWAY_REQUIRED`** — AgentOS rejects requests without
   `X-Kong-Request-Id` (default `true` when `COGNITIVEOS_PRODUCTION_MODE=true`).
   Exempt: `/live`, `/ready`, `/health`, `/metrics`.
3. **`ACTOR_RUNTIME_INTERNAL_ONLY`** — Actor pods require
   `X-Internal-Service-Token` on `POST /execute` (proxied from control plane).
4. **Kubernetes** — `kong-proxy` is the only `LoadBalancer`; `agentos` and
   actor runtimes are `ClusterIP`. Optional
   `docker-compose.gateway-lockdown.yml` removes host port publishes.

## Not in scope (internal protocols)

- **NATS** — actor-to-actor messaging (`nats:4222`)
- **MongoDB / Redis / Neo4j** — data plane only
- **OPA** — in-cluster policy engine (`opa:8181`)

## Configuration

| Variable | Purpose |
|----------|---------|
| `API_GATEWAY_REQUIRED` | Block direct AgentOS access without Kong |
| `ACTOR_RUNTIME_INTERNAL_ONLY` | Block direct actor `/execute` |
| `INTERNAL_SERVICE_TOKEN` | Control plane → actor runtime auth |
| `COGCTL_API_URL` | cogctl gateway base URL |

## Lockdown compose overlay

```bash
docker compose -f docker-compose.yml -f docker-compose.gateway-lockdown.yml up
```

Only Kong publishes `:8000`; backend services are reachable only on the
Docker network.

## Files

| Path | Role |
|------|------|
| `kong/kong.yml` | Declarative Kong routes (source of truth) |
| `docker-compose.yml` | Kong service on `:8000` |
| `deploy/k8s/kong.yaml` | Kong Deployment + LoadBalancer Service |
| `src/monkey_brain/api/gateway_boundary.py` | AgentOS Kong header enforcement |
| `src/monkey_brain/api/internal_auth.py` | Actor runtime internal token |
