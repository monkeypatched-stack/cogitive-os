# workflows

## Capability: workflows
- **ID:** cap-workflow-001
- **Platform:** Workflow/Orchestration
- **Version:** 1.0.0
- **Status:** active
- **Description:** Workflow orchestration (n8n, Temporal, Airflow)
- **Module:** Cerebellum
- **Tags:** workflow, orchestration, n8n, temporal

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/workflows`
- **Protocol:** http

### Operations
- **start** (CREATE): Start a workflow
- **status** (READ): Get workflow status
- **cancel** (DELETE): Cancel a workflow

### Test Scenarios
- happy_path
- timeout
- error
