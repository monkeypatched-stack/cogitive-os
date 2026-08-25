# webhook

## Capability: webhook
- **ID:** cap-api-webhook-001
- **Platform:** API/Webhook
- **Version:** 1.0.0
- **Status:** active
- **Description:** Webhook receiver and dispatcher
- **Module:** Cerebellum
- **Tags:** api, webhook, event

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/webhook`
- **Protocol:** http

### Operations
- **register** (CREATE): Register a webhook endpoint
- **dispatch** (CREATE): Dispatch a webhook event

### Test Scenarios
- happy_path
- timeout
- error
