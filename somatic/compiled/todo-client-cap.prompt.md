---
constraints:
- TODO-CAP-001
- TODO-CAP-002
- TODO-CAP-003
review_gate:
  mode: constitutional
  outcomes:
    approved: "APPROVED \u2014 todo-client capability conforms to all API client invariants."
    rejected:
    - "REJECTED \u2014 Untyped parameter in operation."
    - "REJECTED \u2014 Auth credential passed per operation call."
    - "REJECTED \u2014 Raw HTTP error exposed to caller."
---

# todo-client capability

## Capability Metadata

Typed todo API client capability

**Base URL:** `http://localhost:8090`
**Auth:** bearer — Bearer {{token}}

## Preamble

The todo-client capability wraps the Todo REST API as a registered MonkeyBrain ICapability. It provides typed operations for interacting with todo resources. Authentication is via JWT Bearer token injected at registration. Errors are mapped to domain exceptions. Retries on 429/5xx with exponential backoff.

## Operations

### 1. create_todo

POST /todos/ — Create todo. Auth required: True.

### 2. list_todos

GET /todos/ — List todos. Auth required: False.

### 3. get_todo

GET /todos/{id} — Get todo. Auth required: False.

### 4. complete_todo

GET /todos/ — Complete todo. Auth required: False.

### 5. delete_todo

DELETE /todos/{id} — Delete todo. Auth required: True.
