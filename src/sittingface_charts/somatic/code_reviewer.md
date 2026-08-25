# code_reviewer

## Capability: code_reviewer
- **ID:** cap-pipeline-review-001
- **Platform:** Pipeline/Review
- **Version:** 1.0.0
- **Status:** active
- **Description:** Orchestrates human code review via OpenClaw/n8n
- **Module:** Cerebellum
- **Tags:** pipeline, review, human

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/code_reviewer`
- **Protocol:** http

### Operations
- **request_review** (POST): Request code review

### Test Scenarios
- happy_path
- timeout
- error
