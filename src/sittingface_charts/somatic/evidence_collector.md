# evidence_collector

## Capability: evidence_collector
- **ID:** cap-evidence-001
- **Platform:** Pipeline/Evidence
- **Version:** 1.0.0
- **Status:** active
- **Description:** Collects operational evidence from introspection via OpenClaw/n8n
- **Module:** Cerebellum
- **Tags:** pipeline, evidence, introspection, metrics

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/evidence_collector`
- **Protocol:** http

### Operations
- **collect** (POST): Collect evidence

### Test Scenarios
- happy_path
- timeout
- error
