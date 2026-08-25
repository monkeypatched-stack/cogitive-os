# introspection

## Module: introspection
- **Layer:** 2
- **Alias:** Lemon
- **Role:** Observability, tracing, and debugging of cognitive execution
- **Owns:** Metrics, Telemetry, DistributedTracing, StructuredLogging, Profiling, Auditing, Dashboards, Alerting, HealthMonitoring, OperationalAnalytics
- **Never Owns:** WorkflowExecution, Scheduling, Memory, Persistence, CapabilityLogic, Planning, WorldModel

## Principle: introspection-principle-1
> Every runtime component emits telemetry. Nothing executes silently.

## Principle: introspection-principle-2
> Every request is traceable from first user interaction to final response.

## Principle: introspection-principle-3
> Lemon observes. It never changes runtime behavior.

## Principle: introspection-principle-4
> Architecture is OpenTelemetry-compatible for future integrations.

## Principle: introspection-principle-5
> Audit records are immutable. Written once. Never modified.

## Invariant: INTRO-INV-001
- **Rule:** lemon_observes_only
- **Severity:** critical
- **Rationale:** introspection never modifies runtime behavior. It observes only.
- **Audit:** Verify: introspection never modifies runtime behavior. It observes only.
- **Rejection:** REJECTED — introspection contains runtime modification logic.

## Invariant: INTRO-INV-002
- **Rule:** no_unstructured_logs
- **Severity:** high
- **Rationale:** No unstructured console output in production. All logs are structured JSON.
- **Audit:** Verify: No unstructured console output in production. All logs are structured JSON.
- **Rejection:** REJECTED — Unstructured logging found.

## Invariant: INTRO-INV-003
- **Rule:** trace_id_propagation
- **Severity:** critical
- **Rationale:** Every operation must propagate TraceID and SpanID.
- **Audit:** Verify: Every operation must propagate TraceID and SpanID.
- **Rejection:** REJECTED — Operation missing TraceID propagation.

## Prompt
**Preamble:** Module: introspection — Observability, tracing, and debugging of cognitive execution

**Chain of Thought:**
1. Assert: introspection observes. It never modifies runtime behavior. — _INTRO-INV-001_ ⚠️ AUDIT GATE
2. Verify every file in src/introspection/ maps to exactly one observability concern.
3. Verify tracing.py propagates TraceID and SpanID across all boundaries. — _INTRO-INV-003_ ⚠️ AUDIT GATE
4. Verify logging.py emits structured JSON only. No console.log or print. — _INTRO-INV-002_ ⚠️ AUDIT GATE
5. Map all metric categories: runtime, performance, AI, capability, persistence, memory.
6. Verify audit records are append-only and immutable.
7. Produce all 14 deliverables.
8. Run constitutional review gate. ⚠️ AUDIT GATE

**Review Gate:** constitutional
- **Approved:** APPROVED — introspection conforms to Observability Constitution v1.0.0
- **Rejected:** REJECTED — introspection modifies runtime behavior., REJECTED — Unstructured logging found., REJECTED — TraceID propagation missing.
