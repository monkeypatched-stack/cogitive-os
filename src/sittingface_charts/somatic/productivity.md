# productivity

## Capability: productivity
- **ID:** cap-prod-001
- **Platform:** Productivity/Office
- **Version:** 1.0.0
- **Status:** active
- **Description:** Productivity tool integrations (Calendar, Drive, etc.)
- **Module:** Cerebellum
- **Tags:** productivity, calendar, drive

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/productivity`
- **Protocol:** http

### Operations
- **list_events** (READ): List calendar events
- **create_event** (CREATE): Create a calendar event

### Test Scenarios
- happy_path
- timeout
- error
