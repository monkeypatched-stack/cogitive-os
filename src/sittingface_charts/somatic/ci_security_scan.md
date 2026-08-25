# ci_security_scan

## Capability: ci_security_scan
- **ID:** cap-ci-security-001
- **Platform:** Pipeline/CI
- **Version:** 1.0.0
- **Status:** active
- **Description:** Runs bandit security scanning via OpenClaw/n8n with local fallback
- **Module:** Cerebellum
- **Tags:** pipeline, ci, security, scanning

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/ci_security_scan`
- **Protocol:** http

### Operations
- **scan** (POST): Run security scan

### Test Scenarios
- happy_path
- timeout
- error
