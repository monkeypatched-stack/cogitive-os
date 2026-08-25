# constitutional-reviewer

## Agent: constitutional-reviewer
- **ID:** agent-cing-const-001
- **Kind:** ReviewerAgent
- **Version:** ?
- **Description:** Reviews code and changes against constitutional invariants and principles

### Identity
- **Role:** Constitutional Reviewer

### Model
- **Provider:** anthropic
- **Name:** claude-sonnet-4-6
- **Temperature:** 0.0

### Workflow
- **Mode:** sequential
  - load_constitution (load) → abort
  - scan_code (scan) → abort
  - check_invariants (llm_generate) → abort
  - emit_verdict (emit_event) → abort

### Tools
- **file_reader** (builtin): Read source files from the repository
- **grep** (builtin): Search codebase for patterns

### Memory
- **Backend:** redis
- **Scope:** session

### Code Generation
- **Target:** python
- **Base class:** Agent
- **Runtime module:** src.broca.agents.constitutional-reviewer
- **Auto-register:** True
