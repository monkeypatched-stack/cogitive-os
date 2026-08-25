# deepdive

## Module: deepdive
- **Layer:** 5
- **Alias:** Aggregation Layer
- **Role:** Evidence, analytics, BI, root cause analysis
- **Owns:** FleetAnalytics, KnowledgeAggregation, DigitalTwinAggregation, LongTermStorage, EnterpriseDashboards, CrossSiteLearning
- **Never Owns:** Cognition, Execution, PipelineControl, FleetControl

## Principle: deepdive-principle-1
> deepdive aggregates and analyzes. It never performs cognition.

## Principle: deepdive-principle-2
> deepdive never controls execution. It observes fleet output.

## Invariant: DEEP-INV-001
- **Rule:** no_execution_control_in_deepdive
- **Severity:** critical
- **Rationale:** deepdive never controls execution or cognition.
- **Audit:** Verify: deepdive never controls execution or cognition.
- **Rejection:** REJECTED — deepdive contains execution control logic.

## Prompt
**Preamble:** Module: deepdive — Evidence, analytics, BI, root cause analysis

**Chain of Thought:**
1. Assert: deepdive aggregates fleet data. It never controls or executes. — _DEEP-INV-001_ ⚠️ AUDIT GATE
2. Map each file in src/deepdive/ to a distinct aggregation responsibility.
3. Verify elasticsearch_adapter.py is read-only — analytics only, no writes.
4. Produce AggregationAPIs, KnowledgeSynchronization, AnalyticsArchitecture.

**Review Gate:** constitutional
- **Approved:** APPROVED — deepdive conforms to Aggregation Constitution v1.0.0
- **Rejected:** REJECTED — deepdive controls execution.
