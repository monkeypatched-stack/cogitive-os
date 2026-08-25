# pr_creator

## Capability: pr_creator
- **ID:** cap-pipeline-pr-001
- **Platform:** Pipeline/Git
- **Version:** 1.0.0
- **Status:** active
- **Description:** Creates pull requests from generated code via OpenClaw/n8n
- **Module:** Cerebellum
- **Tags:** pipeline, git, pr, github

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/pr_creator`
- **Protocol:** http

### Operations
- **create_pr** (POST): Create a pull request

### Test Scenarios
- happy_path
- timeout
- error
