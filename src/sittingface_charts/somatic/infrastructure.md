# infrastructure

## Capability: infrastructure
- **ID:** cap-infra-001
- **Platform:** Infrastructure/Container
- **Version:** 1.0.0
- **Status:** active
- **Description:** Container and orchestration management (Docker, K8s)
- **Module:** Cerebellum
- **Tags:** infrastructure, docker, kubernetes

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/infrastructure`
- **Protocol:** http

### Operations
- **list_containers** (READ): List containers
- **deploy** (CREATE): Deploy a service

### Test Scenarios
- happy_path
- timeout
- error
