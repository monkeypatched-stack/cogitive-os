# OpenAPI Spec

MonkeyBrain's REST surface is fully described by a live, auto-generated
OpenAPI 3.1.0 document — FastAPI builds it from the actual route
signatures and Pydantic models, so it can't drift from the real API the
way a hand-maintained spec can.

**Live, always current:**
- `GET /openapi.json` — the raw spec
- `GET /docs` — Swagger UI (interactive, try-it-out)
- `GET /redoc` — ReDoc (readable reference)

**Frozen snapshot:** [`docs/openapi.json`](openapi.json) — captured live
from a running server on 2026-08-26 (`info.version: 2.0.0`,
337 paths / 384 operations, 100% have a `summary`). Regenerate with:

```bash
curl -s http://localhost:8031/openapi.json | python3 -m json.tool > docs/openapi.json
```

Do this after any route signature or Pydantic model change that should
be reflected in committed docs — the live endpoint is always the source
of truth; this file is a point-in-time export for offline reading and
diffing.

See [`docs/examples.md`](examples.md) for real request/response pairs
against a representative slice of these routes.
