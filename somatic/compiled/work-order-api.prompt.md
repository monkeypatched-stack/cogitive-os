---
constraints:
- WO-INV-001
- WO-INV-002
- WO-INV-003
- WO-INV-004
- WORK-O-AUTH-001
- WORK-O-LOG-001
- WORK-O-OBS-001
- WORK-O-OBS-002
- WORK-O-DDD-001
- WORK-O-DDD-002
review_gate:
  mode: constitutional
  outcomes:
    approved: "APPROVED \u2014 work-order API conforms to all DDD, auth, and observability\
      \ invariants."
    rejected:
    - "REJECTED \u2014 Duplicate or mutated WorkOrderNumber."
    - "REJECTED \u2014 WorkOrder started without assignment."
    - "REJECTED \u2014 WorkOrder completed with open tasks."
    - "REJECTED \u2014 Cancelled WorkOrder reactivated."
    - "REJECTED \u2014 Protected route missing auth dependency."
    - "REJECTED \u2014 Handler missing Lemon structured log."
    - "REJECTED \u2014 Manual sentry_sdk.capture_exception in business logic."
    - "REJECTED \u2014 OpenTelemetry middleware out of order."
    - "REJECTED \u2014 Domain layer contains framework import."
    - "REJECTED \u2014 WorkOrder mutation produces no domain event."
---

# work-order-api

## Preamble

You are a senior software architect generating a production-grade FastAPI service for Work order management for maintenance and operations. The service is structured around Domain-Driven Design with a WorkOrder aggregate root, entities [Task, Assignment, Attachment], and value objects [WorkOrderNumber, Priority, Status, Location, ScheduledWindow]. Authentication uses JWT Bearer tokens validated in a FastAPI dependency. All requests are structured-logged through the Lemon logger with correlation-ID propagation. Errors are captured in Sentry via a global middleware. All inbound/outbound spans are emitted via OpenTelemetry middleware to the Lemon collector.

## Chain of Thought

### 1. Domain layer — entities, value objects, aggregates, events, repository ABC

Pure Python only. WorkOrder aggregate root enforces invariants, emits WorkOrderCreated, WorkOrderAssigned, WorkOrderStarted, WorkOrderCompleted, WorkOrderCancelled, TaskAdded. Subdirs: entities/, value_objects/, aggregates/, repositories/, events/, services/, specifications/, exceptions/, policies/

### 2. Application layer — commands, queries, handlers, dto

Handlers orchestrate: load aggregate → invoke behavior → persist → emit events. No framework imports. Subdirs: commands/, queries/, handlers/, dto/

### 3. Infrastructure layer — Motor repository, database connection

MotorWorkOrderRepository in infrastructure/persistence/motor/. AsyncIOMotorClient factory in infrastructure/database/. No SQLAlchemy.

### 4. API layer — FastAPI router, Pydantic schemas, JWT dependencies

router.py calls handlers ONLY. All protected routes use Depends(get_current_user) from dependencies.py.

### 5. Main + settings — lifespan, Sentry, /health, structured logging

Lifespan: Sentry → Motor → yield → close. /health endpoint. Timing middleware.
