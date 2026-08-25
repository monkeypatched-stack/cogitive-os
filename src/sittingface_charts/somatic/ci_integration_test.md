# ci_integration_test

## Capability: ci_integration_test
- **ID:** cap-ci-integration-001
- **Platform:** Pipeline/CI
- **Version:** 1.0.0
- **Status:** active
- **Description:** Runs integration tests via OpenClaw/n8n with local fallback
- **Module:** Cerebellum
- **Tags:** pipeline, ci, testing, integration

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/ci_integration_test`
- **Protocol:** http

### Operations
- **run_tests** (POST): Run integration tests

### Test Scenarios
- happy_path
- timeout
- error
