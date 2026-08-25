# safety-reviewer

## Agent: safety-reviewer
- **ID:** agent-cing-safe-001
- **Kind:** ReviewerAgent
- **Version:** ?
- **Description:** Reviews code for operational safety, error handling, and graceful degradation

### Identity
- **Role:** Safety Reviewer

### Model
- **Provider:** anthropic
- **Name:** claude-sonnet-4-6
- **Temperature:** 0.0

### Workflow
- **Mode:** sequential
  - load_safety_rules (load) → abort
  - scan_error_handling (scan) → abort
  - check_resilience (llm_generate) → abort
  - emit_verdict (emit_event) → abort

### Tools
- **file_reader** (builtin): Read source files from the repository
- **grep** (builtin): Search codebase for patterns
- **error_analyzer** (builtin): Analyze error handling patterns and timeout configurations

### Memory
- **Backend:** redis
- **Scope:** session

### Code Generation
- **Target:** python
- **Base class:** Agent
- **Runtime module:** src.broca.agents.safety-reviewer
- **Auto-register:** True
