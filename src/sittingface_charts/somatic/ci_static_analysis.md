# ci_static_analysis

## Capability: ci_static_analysis
- **ID:** cap-ci-static-001
- **Platform:** Pipeline/CI
- **Version:** 1.0.0
- **Status:** active
- **Description:** Runs ruff, mypy static analysis via OpenClaw/n8n with local fallback
- **Module:** Cerebellum
- **Tags:** pipeline, ci, static-analysis, linting

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/ci_static_analysis`
- **Protocol:** http

### Operations
- **analyze** (POST): Run static analysis

### Test Scenarios
- happy_path
- timeout
- error
