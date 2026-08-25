---
constraints:
- TODO-INV-001
- TODO-INV-002
- TODO-INV-003
- TODO-AUTH-001
- TODO-LOG-001
- TODO-OBS-001
- TODO-OBS-002
- TODO-DDD-001
- TODO-DDD-002
review_gate:
  mode: constitutional
  outcomes:
    approved: "APPROVED \u2014 todo API conforms to all DDD, auth, and observability\
      \ invariants."
    rejected:
    - "REJECTED \u2014 Todo title is empty or exceeds 200 chars."
    - "REJECTED \u2014 Deleted Todo marked completed."
    - "REJECTED \u2014 DueDate is in the past."
    - "REJECTED \u2014 Protected route missing auth dependency."
    - "REJECTED \u2014 Handler missing Lemon structured log."
    - "REJECTED \u2014 Manual sentry_sdk.capture_exception in business logic."
    - "REJECTED \u2014 OpenTelemetry middleware out of order."
    - "REJECTED \u2014 Domain layer contains framework import."
    - "REJECTED \u2014 Todo mutation produces no domain event."
---

# todo-api

## Preamble

You are a senior software architect generating a production-grade FastAPI service for Todo task management application. The service is structured around Domain-Driven Design with a Todo aggregate root, entities [TodoItem], and value objects [Title, DueDate, Priority, Status]. Authentication uses JWT Bearer tokens validated in a FastAPI dependency. All requests are structured-logged through the Lemon logger with correlation-ID propagation. Errors are captured in Sentry via a global middleware. All inbound/outbound spans are emitted via OpenTelemetry middleware to the Lemon collector.

## Chain of Thought

### 1. Domain layer — entities, value objects, aggregates, events, repository ABC

Pure Python only. Todo aggregate root enforces invariants, emits TodoCreated, TodoCompleted, TodoDeleted, TodoReassigned. Subdirs: entities/, value_objects/, aggregates/, repositories/, events/, services/, specifications/, exceptions/, policies/

### 2. Application layer — commands, queries, handlers, dto

Handlers orchestrate: load aggregate → invoke behavior → persist → emit events. No framework imports. Subdirs: commands/, queries/, handlers/, dto/

### 3. Infrastructure layer — Motor repository, database connection

MotorTodoRepository in infrastructure/persistence/motor/. AsyncIOMotorClient factory in infrastructure/database/. No SQLAlchemy.

### 4. API layer — FastAPI router, Pydantic schemas, JWT dependencies

router.py calls handlers ONLY. All protected routes use Depends(get_current_user) from dependencies.py.

### 5. Main + settings — lifespan, Sentry, /health, structured logging

Lifespan: Sentry → Motor → yield → close. /health endpoint. Timing middleware.
