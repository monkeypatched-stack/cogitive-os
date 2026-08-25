# ci_constitution_test

## Capability: ci_constitution_test
- **ID:** cap-ci-constitution-001
- **Platform:** Pipeline/CI
- **Version:** 1.0.0
- **Status:** active
- **Description:** Validates code against constitutional invariants via OpenClaw/n8n
- **Module:** Cerebellum
- **Tags:** pipeline, ci, constitution, governance

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/ci_constitution_test`
- **Protocol:** http

### Operations
- **validate** (POST): Validate constitution

### Test Scenarios
- happy_path
- timeout
- error
