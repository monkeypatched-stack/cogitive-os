# tool-orchestration-agent

## Agent: tool-orchestration-agent
- **ID:** agent-tool-001
- **Kind:** ToolAgent
- **Version:** ?
- **Description:** Selects and executes tools/functions to fulfill a goal

### Identity
- **Role:** Tool Orchestration Agent

### Model
- **Provider:** anthropic
- **Name:** claude-sonnet-4-6
- **Temperature:** 0.0

### Workflow
- **Mode:** sequential
  - analyze_goal (llm_generate) → abort
  - select_tools (tool_select) → fallback
  - execute_tools (tool_call) → retry
  - validate_output (validate) → fallback

### Tools
- **web_search** (builtin): Search the web for current information
- **code_executor** (builtin): Execute Python code in a sandboxed environment
- **send_email** (mcp): Send email via Gmail
- **database_query** (http): None

### Memory
- **Backend:** redis
- **Scope:** session

### Code Generation
- **Target:** python
- **Base class:** Agent
- **Runtime module:** src.broca.agents.tool-orchestration-agent
- **Auto-register:** True
