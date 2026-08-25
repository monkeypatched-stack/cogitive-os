# ci_simulation

## Capability: ci_simulation
- **ID:** cap-ci-sim-001
- **Platform:** Pipeline/CI
- **Version:** 1.0.0
- **Status:** active
- **Description:** Runs simulation through cortex world model via OpenClaw/n8n
- **Module:** Cerebellum
- **Tags:** pipeline, ci, simulation

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/ci_simulation`
- **Protocol:** http

### Operations
- **simulate** (POST): Run simulation

### Test Scenarios
- happy_path
- timeout
- error
