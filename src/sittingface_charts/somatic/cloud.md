# cloud

## Capability: cloud
- **ID:** cap-cloud-001
- **Platform:** Cloud/Infrastructure
- **Version:** 1.0.0
- **Status:** active
- **Description:** Multi-cloud resource management
- **Module:** Cerebellum
- **Tags:** cloud, aws, azure, gcp

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/cloud`
- **Protocol:** http

### Operations
- **list_resources** (READ): List cloud resources
- **provision** (CREATE): Provision a resource

### Test Scenarios
- happy_path
- timeout
- error
