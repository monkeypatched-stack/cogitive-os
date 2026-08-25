---
constraints:
- WORKORDE-CAP-001
- WORKORDE-CAP-002
- WORKORDE-CAP-003
review_gate:
  mode: constitutional
  outcomes:
    approved: "APPROVED \u2014 work-order-client capability conforms to all API client\
      \ invariants."
    rejected:
    - "REJECTED \u2014 Untyped parameter in operation."
    - "REJECTED \u2014 Auth credential passed per operation call."
    - "REJECTED \u2014 Raw HTTP error exposed to caller."
---

# work-order-client capability

## Capability Metadata

Typed work-order API client capability

**Base URL:** `http://localhost:8090`
**Auth:** bearer — Bearer {{token}}

## Preamble

The work-order-client capability wraps the Work-Order REST API as a registered MonkeyBrain ICapability. It provides typed operations for interacting with work-order resources. Authentication is via JWT Bearer token injected at registration. Errors are mapped to domain exceptions. Retries on 429/5xx with exponential backoff.

## Operations

### 1. create_work_order

POST /work-orders/ — Create work order. Auth required: True.

### 2. get_work_order

GET /work-orders/{id} — Get work order. Auth required: False.
