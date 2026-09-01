# SittingFace Knowledge Retrieval

This document describes how external SittingFace chart knowledge is retrieved and injected into CognitiveOS prompts.

## Architecture

```
POST /prompt
    -> PlanetaryRuntime.execute_actor_request()
        -> SocietyRuntime tick / CognitiveRuntime (belief_runtime)
            -> ContextConstructionEngine.build_async()
                -> SittingFaceKnowledgeRetriever.retrieve()
                    |-- keyword: SomaticCompiler.search()
                    `-- vector (optional): SemanticMemory.query()
                -> PlanningContext.relevant_external_knowledge
            -> LLMPlanner._build_prompt()
                -> "External knowledge (SittingFace)" section in LLM input
```

Parallel path for ETASS workloads:

```
ETASSSpec -> PromptCompilerAgent._compile_async()
    -> SittingFaceKnowledgeRetriever.retrieve()
    -> StructuredPromptIR.compiled_prompt (External Knowledge section)
```

## Boundaries

| Layer | Role |
|-------|------|
| Neo4j / knowledge graph | Authoritative structured world state (`relevant_knowledge`) |
| Actor beliefs | Per-actor durable state |
| SittingFace charts | External reference knowledge (`relevant_external_knowledge`) |
| `rag-agent` chart | **Aspirational** — not implemented as a runtime agent |

## Retrieval policy

Retrieval runs when:

- `meta.include_external_knowledge` is set, or
- The query has enough content tokens and matches knowledge-seeking patterns (`what`, `how`, `architecture`, `compliance`, `CAPA`, etc.), or
- The query has four or more content tokens

Skipped when `meta.skip_external_knowledge` is set or the query is empty.

## Fallback behavior

1. Vector backend available → keyword + vector merged (deduplicated by chart)
2. Vector unavailable → keyword only (`keyword_fallback` in telemetry)
3. Vector errors → keyword results preserved; prompt path continues
4. No matches → planning continues without external knowledge

## Observability

`PlanningContext.metadata["external_knowledge_retrieval"]` records:

- `attempted`, `query`, `methods_used`, `result_count`, `sources`
- `vector_available`, `vector_used`, `latency_ms`, `cache_hit`, `injected`

Logs: `agentos.knowledge.sittingface` at INFO for each retrieval.

## Deduplication

Per-cycle cache (`contextvars`) keyed by `execution_id:normalized_query` prevents duplicate retrieval within one cognitive cycle (planning, negotiation somatic snippets, ETASS compile).

## Limitations

- Vector retrieval requires `SemanticMemory` (Elasticsearch + embedder) wired at planetary boot
- Hybrid `/query` retrieval uses keyword path via the same retriever
- Not every code path uses `PromptCompilerAgent` (grocery actors use `LLMPlanner` only)
- The `rag-agent` somatic chart (embed/rerank pipeline) remains unimplemented
