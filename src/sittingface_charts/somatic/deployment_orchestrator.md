# deployment_orchestrator

## Capability: deployment_orchestrator
- **ID:** cap-deploy-orch-001
- **Platform:** Pipeline/Deployment
- **Version:** 1.0.0
- **Status:** active
- **Description:** Orchestrates full deployment pipeline via OpenClaw/n8n
- **Module:** Cerebellum
- **Tags:** pipeline, deployment, orchestration

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/deployment_orchestrator`
- **Protocol:** http

### Operations
- **orchestrate** (POST): Orchestrate deployment

### Test Scenarios
- happy_path
- timeout
- error
