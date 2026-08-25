# proprietary

## Capability: proprietary
- **ID:** cap-ent-proprietary-001
- **Platform:** Enterprise/Proprietary
- **Version:** 1.0.0
- **Status:** active
- **Description:** Proprietary enterprise system integrations (SAP, Oracle, etc.)
- **Module:** Cerebellum
- **Tags:** enterprise, erp, sap, oracle

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/proprietary`
- **Protocol:** http

### Operations
- **list_systems** (READ): List available systems
- **connect** (CREATE): Connect to an enterprise system

### Test Scenarios
- happy_path
- timeout
- error
