# feedback_loop

## Capability: feedback_loop
- **ID:** cap-feedback-001
- **Platform:** Pipeline/Feedback
- **Version:** 1.0.0
- **Status:** active
- **Description:** Feeds operational evidence back into somatic charts via OpenClaw/n8n
- **Module:** Cerebellum
- **Tags:** pipeline, feedback, loop

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/feedback_loop`
- **Protocol:** http

### Operations
- **apply** (POST): Apply feedback

### Test Scenarios
- happy_path
- timeout
- error
