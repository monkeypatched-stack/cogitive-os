# coding-standards-reviewer

## Agent: coding-standards-reviewer
- **ID:** agent-cing-std-001
- **Kind:** ReviewerAgent
- **Version:** ?
- **Description:** Reviews code for style, naming, documentation, and best practices

### Identity
- **Role:** Coding Standards Reviewer

### Model
- **Provider:** anthropic
- **Name:** claude-sonnet-4-6
- **Temperature:** 0.0

### Workflow
- **Mode:** sequential
  - load_style_rules (load) → abort
  - scan_code_style (scan) → abort
  - check_standards (llm_generate) → abort
  - emit_verdict (emit_event) → abort

### Tools
- **file_reader** (builtin): Read source files from the repository
- **grep** (builtin): Search codebase for patterns
- **linter** (builtin): Run linting checks (ruff, mypy)

### Memory
- **Backend:** redis
- **Scope:** session

### Code Generation
- **Target:** python
- **Base class:** Agent
- **Runtime module:** src.broca.agents.coding-standards-reviewer
- **Auto-register:** True
