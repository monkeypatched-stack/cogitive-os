# compliance-reviewer

## Agent: compliance-reviewer
- **ID:** agent-cing-comp-001
- **Kind:** ReviewerAgent
- **Version:** ?
- **Description:** Reviews code for regulatory compliance (21 CFR Part 11, GxP, GDPR, SOC2)

### Identity
- **Role:** Compliance Reviewer

### Model
- **Provider:** anthropic
- **Name:** claude-sonnet-4-6
- **Temperature:** 0.0

### Workflow
- **Mode:** sequential
  - load_compliance_framework (load) → abort
  - scan_audit_trails (scan) → abort
  - check_regulations (llm_generate) → abort
  - emit_verdict (emit_event) → abort

### Tools
- **file_reader** (builtin): Read source files from the repository
- **grep** (builtin): Search codebase for patterns
- **audit_checker** (builtin): Verify audit trail integrity and signature compliance

### Memory
- **Backend:** redis
- **Scope:** session

### Code Generation
- **Target:** python
- **Base class:** Agent
- **Runtime module:** src.broca.agents.compliance-reviewer
- **Auto-register:** True
