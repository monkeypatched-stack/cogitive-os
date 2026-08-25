---
constraints:
- WF-INV-001
- WF-INV-002
- WF-INV-003
- WF-INV-004
- WF-INV-005
- WF-INV-006
- WF-INV-007
- WF-INV-008
review_gate:
  failAction: halt_pipeline
  passThreshold: APPROVED
  reviewer: CingulateAgent
---

# workflow

## Preamble

You are an orchestration agent executing the MonkeyBrain ETASS pipeline. Your responsibility is to coordinate 15 sequential steps (13 mandatory + 2 optional), each handled by a specialized Broca agent.  You must verify each step succeeds before advancing to the next.  On failure, surface the agent's observations and halt — do not skip or paper over failures.
The pipeline is fully agent-driven:
  api          → ApiChartAgent
  codegen      → ServiceGenAgent
  test-service → TestServiceAgent
  govern       → CingulateAgent  (prompt compliance gate)
  fixit        → FixItAgent      (auto-remediate govern findings)
  ddd-check    → CingulateAgent  (structural DDD audit)
  serve        → ServeAgent
  client       → ClientGenAgent
  chart        → ClientCharterAgent
  compile      → CompileAgentAgent
  comply gdpr  → GDPRAgent
  comply soc2  → SOC2Agent
  create-agent → ClientCapabilityAgent
  plan         → PlannerAgent    (optional)
  execute      → ExecutorAgent   (optional)

## Chain of Thought

### 1. Generate API chart

ApiChartAgent reads the service domain model from sittingface, renders a DDD-compliant values.yaml (somatic/charts/<service>-api/values.yaml), and compiles it into a somatic prompt (somatic/compiled/<service>-api.prompt.md). The prompt encodes the bounded context, aggregate, and all API invariants.

### 2. Generate DDD service code

ServiceGenAgent reads the compiled prompt and calls CodeGenAgent to produce a full DDD-layered Python service: domain/, application/, infrastructure/, api/, main.py, settings.py, Dockerfile, docker-compose.yml, pyproject.toml. Files are written to generated/<service>/ with no double-nesting.

### 3. Run static analysis + correction loop

TestServiceAgent runs ruff and pytest against the generated service. On failure it invokes CodeGenAgent up to max_loops times to patch the failing files. Each correction pass provides domain context so the LLM can resolve F821 import errors correctly.

### 4. Governance review

CingulateAgent reviews the compiled API prompt for constitutional compliance, security posture, and DDD policy adherence.  Returns COMPLIANT / NON-COMPLIANT. On NON-COMPLIANT, run fixit (step 5) before proceeding.

### 5. Auto-fix governance findings

FixItAgent reads the most recent governance report for <service>, extracts the issues list, and calls CodeGenAgent to patch the source files.  Re-run govern after fixit to confirm all findings are resolved.  Skip if step 4 returned COMPLIANT.

### 6. DDD structural audit

DDD structural audit walks generated/<service>/ and scores the directory layout against 18 DDD rules: correct layer separation, aggregate roots, repository interfaces in domain/, Motor implementations in infrastructure/, domain events, etc.  Generates a timestamped compliance report.

### 7. Start the service

ServeAgent launches uvicorn with the generated service, records the PID to ~/.monkeybrain/pids/<service>.pid, and notifies MotorCortexAgent. The service binds on 127.0.0.1:8090 by default.

### 8. Generate typed API client

ClientGenAgent reads api/router.py and api/schemas.py from the generated service, loads the api-client chart invariants, and calls CodeGenAgent to produce a fully-typed httpx client package in generated/<service>-client/.

### 9. Charter the client as a SOMA capability

ClientCharterAgent reverse-engineers the generated client into a SOMA capability chart (somatic/charts/<service>-client/values.yaml), capturing operations, endpoint, auth, and invariants via LLM analysis.

### 10. Compile capability chart to prompt

CompileAgentAgent reads the capability chart and renders an executable .prompt.md (somatic/compiled/<service>-client-cap.prompt.md).  Operations become numbered CoT steps; invariants become front-matter constraints.

### 11. GDPR compliance check

GDPRAgent evaluates data_signals and system_attributes against EU 2016/679 obligations: lawful basis (Art. 6), data minimisation (Art. 25), retention schedule (Art. 5(1)(e)), right-to-erasure (Art. 17), right-to-access (Art. 15), breach notification procedure (Art. 33-34).  Report → ~/.monkeybrain/reports/comply_gdpr_<ts>.json. Exits 1 on CRITICAL or HIGH findings.

### 12. SOC 2 Type II compliance check

SOC2Agent validates the AICPA Trust Service Criteria across CC1 (Control Environment), CC6 (Access), CC7 (Operations), CC8 (Change Management), A (Availability), C (Confidentiality), PI (Processing Integrity), P (Privacy).  The generated service satisfies monitoring_alerting_enabled (CC7.2) via AuditLogMiddleware in api/audit_log.py — every HTTP request emits a structured JSON record with request_id, timestamp, method, path, status_code, duration_ms, and principal.  Report → ~/.monkeybrain/reports/comply_soc2_<ts>.json. Exits 1 on CRITICAL or HIGH findings.

### 13. Register as a live capability agent

ClientCapabilityAgent loads the capability chart, instantiates a runtime agent bound to the live service endpoint, and registers it into the Broca registry so orchestrators can discover and invoke its operations.

### 14. Plan follow-on work

PlannerAgent uses the LLM to decompose the follow-on goal into a YAML execution plan with topologically ordered steps and dependency edges. The plan is saved to ~/.monkeybrain/plans/<service>-<ts>.yaml.

### 15. Execute the plan

ExecutorAgent reads the plan YAML, topo-sorts steps by depends_on, and executes each monkeypatched CLI command in order.  Reports pass/fail per step.
