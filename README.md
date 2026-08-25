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
- [OpenAPI spec](docs/openapi.md) — live and frozen spec, 337 paths /
  384 operations (snapshot as of 2026-08-26; the live endpoint is
  always the current count).
- [Examples](docs/examples.md) — real request/response pairs, captured
  live, not hand-written.
- [Deployment guide](docs/deployment.md) — Docker Compose, Kubernetes,
  Helm.
- [Troubleshooting guide](docs/troubleshooting.md) — real issues hit
  and diagnosed during this build.
- [Architecture Decision Records](docs/adr/) — the full decision record
  for Gates 3 through 11 (006-018).

## Installation

**Prerequisites** (real, required — the `Kernel` fails fast at boot if
any are unreachable): MongoDB, Redis, Neo4j (`bolt://...:7687`).
Optional/degraded-if-absent: NATS, InfluxDB, Elasticsearch (audit
sink), OPA, mem0. Python `>=3.11` for a native install.

**Option A — Docker Compose** (brings up every dependency above plus
the runtime itself):

```bash
git clone https://github.com/monkeypatched-stack/cogitive-os.git
cd cogitive-os
docker compose up agentos
```

**Option B — native**, against your own MongoDB/Redis/Neo4j:

```bash
git clone https://github.com/monkeypatched-stack/cogitive-os.git
cd cogitive-os
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./scripts/start_server.sh 8031
```

See [`docs/deployment.md`](docs/deployment.md) for the full
prerequisites list, Kubernetes manifest, and Helm chart.

## Quick start

```bash
curl http://localhost:8031/live
curl http://localhost:8031/health
```

See [`docs/examples.md`](docs/examples.md) for real request/response
pairs against a representative slice of the API, and
[`docs/openapi.md`](docs/openapi.md) for the full spec.

## License

Copyright (C) 2026 Prashun Javeri. See [`NOTICE`](NOTICE) for the full
copyright/license notice.

CognitiveOS is fully open source under the
[GNU Affero General Public License v3.0 or later](LICENSE)
(AGPL-3.0-or-later). Free to use, modify, and self-host. If you modify
this software and make it available to users over a network, AGPLv3
requires you to make your complete modified source available to those
users under the same license. There is no restricted "Enterprise
Edition" — see [Commercial Services](#cognitiveos-commercial-services)
below for what Monkeypatched offers alongside the open-source runtime.

## CognitiveOS Commercial Services

CognitiveOS is fully open source under the GNU Affero General Public
License v3.0 or later (AGPL-3.0-or-later).

Monkeypatched does not restrict access to the CognitiveOS cognitive
runtime in order to create a paid "Enterprise Edition".

Instead, Monkeypatched provides optional commercial services for
organizations that need CognitiveOS adapted to their own environment.

### Enterprise World Integration

Organizations can engage Monkeypatched to connect CognitiveOS to their
specific enterprise world.

This may include:

#### Ontology

- Enterprise ontology design
- Entity and relationship modeling
- Ontology mapping
- Domain-specific semantics
- Ontology evolution

#### Data Integration

- ERP systems
- CRM systems
- WMS systems
- Databases
- Internal APIs
- Event streams
- Existing enterprise platforms

#### Capabilities

- Enterprise-specific capabilities
- Provider integrations
- Internal tools
- Domain-specific execution interfaces

#### Deployment

- Cloud deployment
- Edge deployment
- On-premises deployment
- Private infrastructure
- Production integration

#### Security and Governance

- Enterprise identity integration
- Authorization integration
- Policy integration
- Governance configuration
- Audit integration

#### Ongoing Services

- Ontology maintenance
- Integration maintenance
- Custom engineering
- Production support
- Architecture assistance
- Upgrades and migration

### Important Licensing Boundary

Commercial services are separate from the CognitiveOS open-source
license.

The CognitiveOS source code remains available under AGPL-3.0-or-later.

Purchasing commercial services does not remove the customer's rights
under the AGPL.

Likewise, using CognitiveOS under the AGPL does not create an
obligation to purchase commercial services from Monkeypatched.

Specific commercial services, deliverables, support commitments,
warranties, liability provisions, pricing, and other contractual terms
are defined separately in customer agreements.

This document is a description of the commercial model and is not a
commercial services agreement.

### LLM Costs

Customers may incur separate costs for LLM/API usage from their chosen
model providers. Such costs are independent of CognitiveOS licensing
and Monkeypatched professional-services fees.
