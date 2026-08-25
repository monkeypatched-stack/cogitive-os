# MonkeyBrain

A Cognitive OS runtime — persistent, per-actor cognitive agents inside a
shared, persistent world. FastAPI entry point:
`src/monkey_brain/api/main.py`, port 8031.

## Release gate

**[Production Readiness Checklist](docs/production_readiness_checklist.md)**
— a build does not ship until every box is checked, and every box is
tied to real, cited evidence, not a self-report. Re-run in full before
every production release.

## Documentation

- [Architecture](docs/architecture.md) — layering, geography/society
  split, world/policy split, timelines, and how it all actually fits
  together, as verified live across Gates 3-9.
- [OpenAPI spec](docs/openapi.md) — live and frozen spec, 277 paths /
  319 operations.
- [Examples](docs/examples.md) — real request/response pairs, captured
  live, not hand-written.
- [Deployment guide](docs/deployment.md) — Docker Compose, Kubernetes,
  Helm.
- [Troubleshooting guide](docs/troubleshooting.md) — real issues hit
  and diagnosed during this build.
- [Architecture Decision Records](docs/adr/) — the full decision record
  for Gates 3 through 11 (006-018).

## Quick start

```bash
docker compose up agentos
curl http://localhost:8031/live
```

See [`docs/deployment.md`](docs/deployment.md) for prerequisites and
the Kubernetes/Helm paths.

## License

Copyright (C) 2026 Prashun Javeri. See [`NOTICE`](NOTICE) for the full
copyright/license notice.

Dual-licensed:

- **Community**: [GNU Affero General Public License v3.0](LICENSE)
  (AGPLv3). Free to use, modify, and self-host. If you modify this
  software and make it available to users over a network, AGPLv3
  requires you to make your complete modified source available to
  those users under the same license.
- **Enterprise**: a separate commercial license is available for
  organizations that need terms AGPLv3 doesn't provide (no
  network-copyleft obligation, warranty/support commitments, etc.).
  See [`LICENSE-ENTERPRISE.md`](LICENSE-ENTERPRISE.md) — **that
  document is currently a template**, not a signable agreement; the
  commercial terms (pricing, support, warranty) haven't been finalized.
# cogitive-os
# cogitive-os
