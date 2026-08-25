# agents

## Capability: agents
- **ID:** cap-agent-001
- **Platform:** Agent/Discovery
- **Version:** 1.0.0
- **Status:** active
- **Description:** External agent discovery and communication
- **Module:** Cerebellum
- **Tags:** agent, discovery, federation

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/agents`
- **Protocol:** http

### Operations
- **discover** (READ): Discover available agents
- **invoke** (CREATE): Invoke an external agent

### Test Scenarios
- happy_path
- timeout
- error
