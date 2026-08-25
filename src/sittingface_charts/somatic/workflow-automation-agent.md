# workflow-automation-agent

## Agent: workflow-automation-agent
- **ID:** agent-auto-001
- **Kind:** AutomationAgent
- **Version:** ?
- **Description:** Executes structured multi-step task workflows

### Identity
- **Role:** Workflow Automation Agent

### Model
- **Provider:** anthropic
- **Name:** claude-sonnet-4-6
- **Temperature:** 0.1

### Workflow
- **Mode:** sequential
  - validate_input (validate) → abort
  - fetch_context (tool_call) → retry
  - execute_task (llm_generate) → fallback
  - emit_result (emit_event) → abort

### Memory
- **Backend:** redis
- **Scope:** session

### Code Generation
- **Target:** python
- **Base class:** Agent
- **Runtime module:** src.broca.agents.workflow-automation-agent
- **Auto-register:** True
