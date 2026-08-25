# multi-agent-coordinator

## Agent: multi-agent-coordinator
- **ID:** agent-coord-001
- **Kind:** CoordinatorAgent
- **Version:** ?
- **Description:** Routes tasks to specialist sub-agents and aggregates results

### Identity
- **Role:** Multi-Agent Coordinator

### Model
- **Provider:** anthropic
- **Name:** claude-sonnet-4-6
- **Temperature:** 0.3

### Workflow
- **Mode:** sequential
  - decompose_goal (llm_generate) → abort
  - route_subtasks (route) → fallback
  - execute_subtasks (parallel_execute) → fallback
  - aggregate_results (llm_synthesize) → fallback

### Routing
- **Strategy:** llm_intent_classification
- **workflow-automation-agent**: task_execution, scheduling, data_pipeline
- **rag-agent**: knowledge_query, document_search, fact_lookup
- **tool-orchestration-agent**: web_lookup, code_execution, notification, db_query

### Memory
- **Backend:** redis
- **Scope:** session

### Code Generation
- **Target:** python
- **Base class:** Agent
- **Runtime module:** src.broca.agents.multi-agent-coordinator
- **Auto-register:** True
