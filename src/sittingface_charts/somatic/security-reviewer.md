# security-reviewer

## Agent: security-reviewer
- **ID:** agent-cing-sec-001
- **Kind:** ReviewerAgent
- **Version:** ?
- **Description:** Reviews code for security vulnerabilities, secrets exposure, and auth weaknesses

### Identity
- **Role:** Security Reviewer

### Model
- **Provider:** anthropic
- **Name:** claude-sonnet-4-6
- **Temperature:** 0.0

### Workflow
- **Mode:** sequential
  - load_security_rules (load) → abort
  - scan_secrets (scan) → abort
  - check_vulnerabilities (llm_generate) → abort
  - emit_verdict (emit_event) → abort

### Tools
- **file_reader** (builtin): Read source files from the repository
- **grep** (builtin): Search codebase for patterns
- **secret_scanner** (builtin): Scan for hardcoded secrets and API keys

### Memory
- **Backend:** redis
- **Scope:** session

### Code Generation
- **Target:** python
- **Base class:** Agent
- **Runtime module:** src.broca.agents.security-reviewer
- **Auto-register:** True
