# architecture-reviewer

## Agent: architecture-reviewer
- **ID:** agent-cing-arch-001
- **Kind:** ReviewerAgent
- **Version:** ?
- **Description:** Reviews architecture for SOLID compliance, circular dependencies, and layer violations

### Identity
- **Role:** Architecture Reviewer

### Model
- **Provider:** anthropic
- **Name:** claude-sonnet-4-6
- **Temperature:** 0.0

### Workflow
- **Mode:** sequential
  - load_architecture_rules (load) → abort
  - scan_dependencies (scan) → abort
  - check_solid (llm_generate) → abort
  - emit_verdict (emit_event) → abort

### Tools
- **file_reader** (builtin): Read source files from the repository
- **dependency_analyzer** (builtin): Analyze import graphs and detect circular dependencies
- **grep** (builtin): Search codebase for patterns

### Memory
- **Backend:** redis
- **Scope:** session

### Code Generation
- **Target:** python
- **Base class:** Agent
- **Runtime module:** src.broca.agents.architecture-reviewer
- **Auto-register:** True
