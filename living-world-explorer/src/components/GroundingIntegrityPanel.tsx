import type { ContextSnapshotDto, SemanticMemoryDto } from '../api/contextClient'
import { externalEventsFrom } from '../api/contextClient'
import type { GroundingExecutionMeta } from './GroundingDebugger'
import { buildGraph } from './GroundingKnowledgeGraphCard'
import './GroundingDebugger.css'

type RowStatus = 'ok' | 'empty' | 'not_run' | 'missing'

interface Row {
  label: string
  status: RowStatus
  count?: number
  detail: string
}

/** A source is "ran" iff its stage name appears in retrieval_latency_ms
 * — context_engine.py::build()'s retrieve() wrapper records latency for
 * every stage it invokes, success or empty result, so presence there
 * is a real, API-reported signal (not inferred) that the query
 * actually executed this cycle, distinct from "executed and found
 * nothing" (count === 0) or "never ran" (stage missing entirely). */
function sourceRow(snapshot: ContextSnapshotDto, label: string, stage: string, count: number): Row {
  const latency = snapshot.retrieval_latency_ms?.[stage]
  if (latency == null) return { label, status: 'not_run', count, detail: `"${stage}" is missing from retrieval_latency_ms — this stage did not run this cycle` }
  if (count === 0) return { label, status: 'empty', count, detail: `"${stage}" ran in ${latency.toFixed(2)}ms and returned nothing relevant — a real empty result, not a failed query` }
  return { label, status: 'ok', count, detail: `"${stage}" ran in ${latency.toFixed(2)}ms` }
}

const STATUS_GLYPH: Record<RowStatus, string> = { ok: '✓', empty: '●', not_run: '✗', missing: '✗' }
const STATUS_CLASS: Record<RowStatus, string> = { ok: 'ok', empty: 'empty', not_run: 'fail', missing: 'fail' }

/**
 * Section 13's "Grounding Integrity" check, built entirely from fields
 * the real API already returns — no assumption, no fabricated pass/fail.
 * The point isn't to prove everything is populated; it's to make a
 * genuinely-empty section (query ran, found nothing) visibly different
 * from a broken one (query never ran, or a graph node/edge got dropped
 * during adaptation) instead of both rendering as the same blank card.
 */
export function GroundingIntegrityPanel({
  snapshot, semanticMemory, meta,
}: {
  snapshot: ContextSnapshotDto
  semanticMemory: SemanticMemoryDto | null
  meta: GroundingExecutionMeta
}) {
  const experiences = semanticMemory?.retrieved_this_execution.experiences ?? []
  const conversations = semanticMemory?.retrieved_this_execution.conversations ?? []
  const beliefs = semanticMemory?.durable_beliefs ?? []
  const affiliationCount = meta.affiliationChain?.length ?? snapshot.affiliations.length
  const { nodes, edges } = buildGraph(snapshot.knowledge, snapshot.relationships)

  const idRows: Row[] = [
    { label: 'Execution ID', status: meta.executionId ? 'ok' : 'missing', detail: meta.executionId || 'No execution ID on this snapshot' },
    { label: 'Actor', status: meta.actorName ? 'ok' : 'missing', detail: meta.actorName || 'No actor name resolved' },
    { label: 'Goal', status: meta.goal ? 'ok' : 'empty', detail: meta.goal || 'No goal text recorded for this execution' },
    {
      label: 'Snapshot scoped to this execution', status: snapshot.execution_id === meta.executionId ? 'ok' : 'not_run',
      detail: snapshot.execution_id === meta.executionId ? `snapshot.execution_id matches meta.executionId (${meta.executionId})` : `snapshot.execution_id (${snapshot.execution_id}) does not match meta.executionId (${meta.executionId})`,
    },
    {
      label: 'Planning Cycle ID / Context ID', status: 'ok',
      detail: `Same as Execution ID (${meta.executionId}) — this backend does not maintain separate planning-cycle or context-snapshot identifiers`,
    },
  ]

  const sourceRows: Row[] = [
    sourceRow(snapshot, 'Knowledge Entities', 'knowledge_graph', snapshot.knowledge.length),
    sourceRow(snapshot, 'Relationships', 'knowledge_graph', snapshot.relationships.length),
    sourceRow(snapshot, 'Experiences', 'semantic_memory', experiences.length),
    sourceRow(snapshot, 'Conversations', 'semantic_memory', conversations.length),
    sourceRow(snapshot, 'Prior Executions', 'semantic_memory', snapshot.executions.length),
    sourceRow(snapshot, 'Context Events', 'context_stream', snapshot.context_events.length),
    sourceRow(snapshot, 'External Events', 'context_stream', externalEventsFrom(snapshot).length),
    { label: 'Semantic Beliefs', status: beliefs.length > 0 ? 'ok' : 'empty', count: beliefs.length, detail: beliefs.length > 0 ? `${beliefs.length} durable belief(s) observed 2+ times` : 'No fact for this actor has been observed enough times yet to become a durable belief' },
    sourceRow(snapshot, 'Affiliations', 'affiliation_graph', affiliationCount),
    sourceRow(snapshot, 'World Snapshot', 'world_state', snapshot.relevant_locations.length + snapshot.relevant_objects.length),
  ]

  const graphRows: Row[] = [
    {
      label: 'Graph Nodes', status: nodes.length > 0 ? 'ok' : 'empty', count: nodes.length,
      detail: nodes.length === snapshot.knowledge.length
        ? `All ${snapshot.knowledge.length} retrieved entities have a stable ID and rendered as a node`
        : `${snapshot.knowledge.length - nodes.length} of ${snapshot.knowledge.length} retrieved entities have no evidence_ids and could not become a graph node`,
    },
    {
      label: 'Graph Edges', status: edges.length > 0 ? 'ok' : (snapshot.relationships.length > 0 ? 'not_run' : 'empty'), count: edges.length,
      detail: edges.length === snapshot.relationships.length
        ? `All ${snapshot.relationships.length} traversed relationships reference two existing graph nodes`
        : `${snapshot.relationships.length - edges.length} of ${snapshot.relationships.length} relationships reference an entity that wasn't retrieved as a node and were dropped, not drawn as broken edges`,
    },
  ]

  const renderRow = (r: Row, i: number) => (
    <div className="lwe-gd-integrity-row" key={i}>
      <span className={`lwe-gd-integrity-glyph ${STATUS_CLASS[r.status]}`}>{STATUS_GLYPH[r.status]}</span>
      <span className="lwe-gd-integrity-label">{r.label}</span>
      {r.count != null && <span className="lwe-gd-integrity-count">{r.count}</span>}
      <span className="lwe-gd-integrity-detail">{r.detail}</span>
    </div>
  )

  return (
    <div className="lwe-gd-integrity">
      <div className="lwe-gd-integrity-legend">
        <span><span className="lwe-gd-integrity-glyph ok">✓</span> retrieved</span>
        <span><span className="lwe-gd-integrity-glyph empty">●</span> queried, genuinely empty</span>
        <span><span className="lwe-gd-integrity-glyph fail">✗</span> did not run / mismatch</span>
      </div>
      {idRows.map(renderRow)}
      <div className="lwe-gd-integrity-divider" />
      {sourceRows.map(renderRow)}
      <div className="lwe-gd-integrity-divider" />
      {graphRows.map(renderRow)}
    </div>
  )
}
