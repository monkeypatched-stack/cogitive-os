# ci_world_model

## Capability: ci_world_model
- **ID:** cap-ci-worldmodel-001
- **Platform:** Pipeline/CI
- **Version:** 1.0.0
- **Status:** active
- **Description:** Validates against world model state via OpenClaw/n8n
- **Module:** Cerebellum
- **Tags:** pipeline, ci, world-model

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/ci_world_model`
- **Protocol:** http

### Operations
- **validate** (POST): Validate world model

### Test Scenarios
- happy_path
- timeout
- error
