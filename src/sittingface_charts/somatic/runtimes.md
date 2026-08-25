# runtimes

## Capability: runtimes
- **ID:** cap-runtime-001
- **Platform:** Runtime/Execution
- **Version:** 1.0.0
- **Status:** active
- **Description:** Multi-language runtime execution (Python, Node, JVM)
- **Module:** Cerebellum
- **Tags:** runtime, execution, sandbox

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/runtimes`
- **Protocol:** http

### Operations
- **execute** (CREATE): Execute code in a runtime
- **list_runtimes** (READ): List available runtimes

### Test Scenarios
- happy_path
- timeout
- error
