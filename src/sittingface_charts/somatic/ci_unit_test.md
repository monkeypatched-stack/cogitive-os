# ci_unit_test

## Capability: ci_unit_test
- **ID:** cap-ci-unit-001
- **Platform:** Pipeline/CI
- **Version:** 1.0.0
- **Status:** active
- **Description:** Runs unit tests via OpenClaw/n8n with local fallback
- **Module:** Cerebellum
- **Tags:** pipeline, ci, testing

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/ci_unit_test`
- **Protocol:** http

### Operations
- **run_tests** (POST): Run unit tests

### Test Scenarios
- happy_path
- timeout
- error
