# rag-agent

## Agent: rag-agent
- **ID:** agent-rag-001
- **Kind:** RetrievalAgent
- **Version:** ?
- **Description:** Retrieves and synthesizes knowledge from indexed sources

### Identity
- **Role:** Knowledge Retrieval Agent

### Model
- **Provider:** anthropic
- **Name:** claude-sonnet-4-6
- **Temperature:** 0.2

### Workflow
- **Mode:** sequential
  - embed_query (embed) → abort
  - search_sources (search) → retry
  - rerank_results (rerank) → retry
  - synthesize_answer (llm_generate) → fallback

### Memory
- **Backend:** redis
- **Scope:** session

### Code Generation
- **Target:** python
- **Base class:** Agent
- **Runtime module:** src.broca.agents.rag-agent
- **Auto-register:** True
