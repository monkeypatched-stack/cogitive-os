import { useRef, useState } from 'react'
import type { ContextSnapshotDto, SemanticMemoryDto, RetrievedItemDto, CausalStep, AffiliationChainNode, ExecutionConversationMessageDto } from '../api/contextClient'
import { externalEventsFrom } from '../api/contextClient'
import { formatTime } from './inspectorPrimitives'
import { GroundingDetailDrawer, type DrawerContent } from './GroundingDetailDrawer'
import { GroundingKnowledgeGraphCard } from './GroundingKnowledgeGraphCard'
import { GroundingIntegrityPanel } from './GroundingIntegrityPanel'
import { ExecutionChatPanel } from './ExecutionChatPanel'
import { ExecutionSecurityTrace } from './ExecutionSecurityTrace'
import type { ExecutionChatEvidence } from '../api/executionChatClient'
import './GroundingDebugger.css'

export interface GroundingExecutionMeta {
  executionId: string
  actorName: string
  goal: string
  status: string
  time: number | null
  // Real, already-persisted fields (ExecutionRecord.failure_reason/
  // step_failures — kernel/timeline/entry.py) that previously existed
  // but were never surfaced anywhere in the debugger. Absent for a
  // success outcome or an execution recorded before this field existed.
  failureReason?: string
  stepFailures?: string[]
  // Neither is computed by any real route today — both stay undefined
  // for live executions, in which case the sections that use them
  // simply don't render (no fake empty state). demoGroundingData.ts is
  // the one place that sets them.
  causalChain?: CausalStep[]
  affiliationChain?: AffiliationChainNode[]
  // relevant_objects is a plain string[] on the real snapshot — no
  // structured state/provenance behind it today. When this is absent
  // (every real execution), clicking an object chip still opens the
  // drawer, just with only the name — honest, not a dead click.
  objectDetails?: Record<string, { state: string; provenance: string }>
}

const DIFF_SOURCE_LABEL: Record<string, string> = {
  knowledge: 'Knowledge', relationships: 'Relationships', context_events: 'Context Events',
  experiences: 'Experiences', conversations: 'Conversations', executions: 'Executions',
}
const DIFF_SOURCE_ORDER = ['knowledge', 'relationships', 'context_events', 'experiences', 'conversations', 'executions']

// What each grounding source is architecturally FOR, not per-item
// commentary — these map onto the real retrieval stages
// context_engine.py::build() already names (retrieval_latency_ms keys:
// knowledge_graph, organizational, semantic_memory, context_stream,
// affiliation_graph, ...), so the copy stays true for every real
// execution, not only the demo one.
const RETRIEVAL_REASON: Record<string, string> = {
  knowledge: 'Entities resolved from this execution\'s goal',
  relationships: 'Execution dependencies',
  experiences: 'Retrieved for this execution\'s grounding',
  executions: 'Only executions actually referenced by this execution',
  context_events: 'Events referenced by this execution',
  conversations: 'Messages exchanged during this execution',
}

function itemToDrawer(item: RetrievedItemDto, title: string): DrawerContent {
  return {
    title, subtitle: `${item.item_type} · retrieved from ${item.source || 'unknown source'}`,
    fields: [
      { label: 'Content', value: item.content },
      { label: 'Source', value: item.source || 'unknown' },
      { label: 'Confidence', value: item.confidence.toFixed(2) },
      { label: 'Retrieval score', value: item.retrieval_score.toFixed(2) },
      { label: 'Timestamp', value: formatTime(item.timestamp) },
      ...(item.reason ? [{ label: 'Retrieval reason', value: item.reason }] : []),
      ...(item.influence != null ? [{ label: 'Influence', value: item.influence.toFixed(2) }] : []),
      ...(item.evidence_ids.length > 0 ? [{ label: 'Evidence IDs', value: item.evidence_ids.join(', '), mono: true }] : []),
    ],
  }
}

function contextEventToDrawer(item: RetrievedItemDto): DrawerContent {
  return {
    title: item.source || 'Context event',
    subtitle: `${item.item_type} · ${formatTime(item.timestamp)}`,
    fields: [
      { label: 'Event source', value: item.source || 'unknown' },
      { label: 'Timestamp', value: formatTime(item.timestamp) },
      { label: 'Event type', value: item.item_type },
      { label: 'Impact', value: item.impact ? item.impact.toUpperCase() : 'Not classified' },
      { label: 'Description', value: item.content },
      ...(item.affectedEntities?.length ? [{ label: 'Affected entities', value: item.affectedEntities.join(', ') }] : []),
      ...(item.previousState && item.newState ? [{ label: 'Previous state', value: item.previousState }, { label: 'New state', value: item.newState }] : []),
      ...(item.planningCyclesAffected != null ? [{ label: 'Planning cycles affected', value: String(item.planningCyclesAffected) }] : []),
      ...(item.evidence_ids.length > 0 ? [{ label: 'Evidence IDs', value: item.evidence_ids.join(', '), mono: true }] : []),
    ],
  }
}

// A real, derived causal trace for executions that don't have one
// authored (every real execution) — built only from fields that
// genuinely exist on this snapshot (a high-impact context event, a
// real diff against the previous cycle, the execution's own real
// outcome). Produces fewer steps, or none at all, when the underlying
// signal isn't there — never invents a step to pad the chain out.
function deriveCausalChain(snapshot: ContextSnapshotDto, status: string, goal: string): CausalStep[] {
  const steps: CausalStep[] = []
  // Real, always-available anchor — every execution has a goal, so this
  // never leaves the chain empty for a plain success/failure with no
  // high-impact event or diff (previously the whole causal-chain strip
  // silently disappeared for those, unlike the Demo Execution page,
  // which always shows one). No fabricated detail: this is meta.goal
  // itself, not an invented narrative step.
  if (goal) steps.push({ label: 'Goal', detail: goal })

  const worldEvent = snapshot.context_events.find((e) => e.impact === 'high' || e.item_type === 'external_perturbation')
  if (worldEvent) {
    steps.push({ label: 'World Change', detail: worldEvent.content })
    if (worldEvent.newState) {
      steps.push({ label: 'Belief Update', detail: `${worldEvent.affectedEntities?.[0] ?? worldEvent.content}: ${worldEvent.newState}` })
    }
  }
  const diff = snapshot.diff_from_previous
  if (diff && !diff.is_first_context) {
    const added = Object.values(diff.added).reduce((sum, arr) => sum + arr.length, 0)
    const removed = Object.values(diff.removed).reduce((sum, arr) => sum + arr.length, 0)
    if (added || removed) steps.push({ label: 'Grounding Change', detail: `+${added} / −${removed} across grounding sources` })
  } else {
    // Real signal even on a goal's first-ever planning cycle — the
    // entity count actually retrieved, not a diff (there's nothing to
    // diff against yet, which is itself honest information).
    const entityCount = snapshot.knowledge.length
    if (entityCount > 0) steps.push({ label: 'Grounding', detail: `${entityCount} entit${entityCount === 1 ? 'y' : 'ies'} retrieved` })
  }
  steps.push({ label: 'Execution', detail: status || 'unknown outcome' })
  return steps
}

// A dependency-blocked step's failure text always reads "blocked:
// dependency step N did not succeed" (ActionExecutor's own dependency
// gate — see kernel/pipeline/action_executor.py). Distinguishing these
// from the one real root failure means the debugger can say "X failed;
// five steps were blocked by that" instead of presenting six equally-
// weighted failures, which is what actually happened and what
// stepFailures already has the words to prove — no guessing involved.
function deriveFailureAnalysis(stepFailures?: string[]): {
  root: { step: string; reason: string } | null
  blocked: string[]
} {
  if (!stepFailures || stepFailures.length === 0) return { root: null, blocked: [] }
  const parsed = stepFailures.map((f) => {
    const [step, ...rest] = f.split(': ')
    return { step, reason: rest.join(': ') }
  })
  const blocked = parsed.filter((p) => /^blocked:/i.test(p.reason))
  const root = parsed.find((p) => !/^blocked:/i.test(p.reason)) ?? null
  return { root, blocked: blocked.map((b) => b.step) }
}

export function statusColor(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('fail') || s.includes('error')) return '#B91C1C'
  if (s.includes('partial')) return '#B45309'
  if (s.includes('pending') || s.includes('progress') || s.includes('waiting')) return '#B45309'
  return '#047857'
}

function Metric({
  accent, icon, value, unit, label, delta, hint,
}: { accent: string; icon: string; value: number | string; unit?: string; label: string; delta?: number; hint?: string }) {
  return (
    <div className="lwe-gd-metric" style={{ ['--gd-accent' as string]: accent }}>
      <div className="lwe-gd-metric-icon">{icon}</div>
      <div className="lwe-gd-metric-value">{value}{unit && <small>{unit}</small>}</div>
      <div className="lwe-gd-metric-label">{label}</div>
      {delta != null && <div className={`lwe-gd-metric-delta${delta < 0 ? ' down' : ''}`}>{delta >= 0 ? '↑' : '↓'} {Math.abs(delta)} vs prev</div>}
      {hint && <div className="lwe-gd-metric-hint">{hint}</div>}
    </div>
  )
}

export function Card({
  title, subtitle, reason, action, onAction, compact, children,
}: { title: string; subtitle?: string; reason?: string; action?: string; onAction?: () => void; compact?: boolean; children: React.ReactNode }) {
  return (
    <div className={`lwe-gd-card${compact ? ' compact' : ''}`}>
      <div className="lwe-gd-card-head">
        <div>
          <div className="lwe-gd-card-title">{title}</div>
          {subtitle && <div className="lwe-gd-card-subtitle">{subtitle}</div>}
          {reason && <div className="lwe-gd-card-reason">Reason: {reason}</div>}
        </div>
        {action && <button type="button" className="lwe-gd-card-action" onClick={onAction}>{action}</button>}
      </div>
      <div className="lwe-gd-card-body">{children}</div>
    </div>
  )
}

export function Row({
  accent, dot, main, sub, time, badge, onClick, active,
}: {
  accent?: string; dot?: boolean; main: React.ReactNode; sub?: React.ReactNode
  time?: string; badge?: string; onClick?: () => void; active?: boolean
}) {
  return (
    <div className={`lwe-gd-row${sub ? ' stacked' : ''}${active ? ' active' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      {dot && <span className="lwe-gd-row-dot" style={{ background: accent }} />}
      <span className="lwe-gd-row-body">
        <span className="lwe-gd-row-main">{main}</span>
        {sub && <span className="lwe-gd-row-sub">{sub}</span>}
      </span>
      {time && <span className="lwe-gd-row-time">{time}</span>}
      {badge && <span className="lwe-gd-row-badge" style={{ ['--gd-accent' as string]: accent }}>{badge}</span>}
    </div>
  )
}

export function GroundingDebugger({
  meta, snapshot, semanticMemory, executionMessages, onViewGraph, onViewAffiliations,
}: {
  meta: GroundingExecutionMeta
  snapshot: ContextSnapshotDto
  semanticMemory: SemanticMemoryDto | null
  // Real AskActor/DelegateTask messages THIS execution exchanged (GET
  // .../conversation) — distinct from semanticMemory.retrieved_this_
  // execution.conversations (grounding input captured BEFORE this tick's
  // own actions ran, so it can never contain this tick's own exchange).
  // The "Conversations" card below shows this; the "Conversations
  // Retrieved" summary metric keeps showing the grounding-input count,
  // consistent with its sibling metrics (Experiences/Executions/etc,
  // which are all grounding-input counts too).
  executionMessages: ExecutionConversationMessageDto[]
  onViewGraph: () => void
  onViewAffiliations: () => void
}) {
  const [drawer, setDrawer] = useState<DrawerContent | null>(null)
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null)
  const [showIntegrity, setShowIntegrity] = useState(false)
  const [flashCard, setFlashCard] = useState<string | null>(null)

  // Cards the chat's evidence chips can scroll to and flash — one ref
  // per grid card that has real evidence to point at.
  const cardRefs = {
    knowledge: useRef<HTMLDivElement>(null),
    relationship: useRef<HTMLDivElement>(null),
    experience: useRef<HTMLDivElement>(null),
    execution: useRef<HTMLDivElement>(null),
    context_event: useRef<HTMLDivElement>(null),
    conversation: useRef<HTMLDivElement>(null),
    belief: useRef<HTMLDivElement>(null),
    affiliation: useRef<HTMLDivElement>(null),
    world_state: useRef<HTMLDivElement>(null),
  } as const

  // Whether a stage is present in retrieval_latency_ms is a real,
  // API-reported signal that it ran this cycle (see
  // GroundingIntegrityPanel) — used so an empty-state message never
  // claims a query ran when it genuinely didn't.
  const ranStage = (stage: string) => snapshot.retrieval_latency_ms?.[stage] != null
  const emptyBecause = (stage: string, foundNothingText: string) =>
    ranStage(stage) ? `${foundNothingText} — see Grounding Integrity above.` : `"${stage}" did not run this planning cycle — see Grounding Integrity above.`

  const diff = snapshot.diff_from_previous
  const addedCount = (source: string) => diff?.added[source]?.length ?? 0
  const removedCount = (source: string) => diff?.removed[source]?.length ?? 0
  const delta = (source: string) => addedCount(source) - removedCount(source)

  const experiences = semanticMemory?.retrieved_this_execution.experiences ?? []
  const conversations = semanticMemory?.retrieved_this_execution.conversations ?? []
  const durableBeliefs = semanticMemory?.durable_beliefs ?? []
  const external = externalEventsFrom(snapshot)
  const relationshipsShown = snapshot.relationships.slice(0, 12)
  const relationshipsMoreCount = Math.max(0, snapshot.relationships.length - relationshipsShown.length)
  const affiliationChain = meta.affiliationChain
  // Real executions never carry an authored meta.causalChain (only the
  // demo does) — derive one from what this snapshot genuinely has
  // instead of leaving the section absent for every real execution.
  const causalChain = meta.causalChain ?? deriveCausalChain(snapshot, meta.status, meta.goal)

  const openDiffList = (source: string, kind: 'added' | 'removed') => {
    const values = diff?.[kind]?.[source] ?? []
    setDrawer({
      title: `${DIFF_SOURCE_LABEL[source] ?? source} · ${kind === 'added' ? 'Added' : 'Removed'}`,
      subtitle: `${values.length} item${values.length === 1 ? '' : 's'} vs. the previous planning cycle`,
      fields: [],
      list: values.map((v) => ({ primary: v })),
      listLabel: 'Entries',
    })
  }

  const openConversationThread = () => setDrawer({
    title: 'Conversation Thread',
    subtitle: `${executionMessages.length} message${executionMessages.length === 1 ? '' : 's'} exchanged during this execution`,
    fields: [],
    list: executionMessages.map((m) => ({ primary: m.description, secondary: formatTime(m.timestamp) })),
    listLabel: 'Messages',
  })

  const isSparse = !meta.causalChain && snapshot.relationships.length === 0 && experiences.length === 0
    && conversations.length === 0 && snapshot.executions.length === 0

  const selectedRelationship = selectedRelationshipId ? snapshot.relationships.find((r) => r.evidence_ids[0] === selectedRelationshipId) : null
  const selectedLabel = selectedRelationship?.content ?? null

  // Every evidence chip the chat renders came from a real item in this
  // same snapshot/semanticMemory — this just re-finds it (by ref, then
  // by label as a fallback for a model that got the exact ref wrong)
  // and reuses the SAME drawer builders every other card's click uses,
  // so "click evidence" and "click the row yourself" land on identical
  // detail. Never fabricates an item that isn't actually there.
  const onEvidenceClick = (evidence: ExecutionChatEvidence) => {
    const findByRef = (items: RetrievedItemDto[]): RetrievedItemDto | undefined =>
      items.find((it) => evidence.ref && it.evidence_ids.includes(evidence.ref))
      ?? items.find((it) => it.content.toLowerCase().includes(evidence.label.toLowerCase()))

    const scrollTo = (key: keyof typeof cardRefs) => {
      const el = cardRefs[key].current
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFlashCard(key)
      setTimeout(() => setFlashCard((cur) => (cur === key ? null : cur)), 1400)
    }

    switch (evidence.type) {
      case 'knowledge': {
        const found = findByRef(snapshot.knowledge)
        scrollTo('knowledge')
        if (found) setDrawer(itemToDrawer(found, found.content.split(' (')[0]))
        break
      }
      case 'relationship': {
        const found = findByRef(snapshot.relationships)
        scrollTo('relationship')
        if (found) {
          setSelectedRelationshipId(found.evidence_ids[0] ?? null)
          setDrawer(itemToDrawer(found, 'Relationship'))
        }
        break
      }
      case 'experience': {
        const found = findByRef(experiences)
        scrollTo('experience')
        if (found) setDrawer(itemToDrawer(found, 'Experience'))
        break
      }
      case 'execution': {
        const found = findByRef(snapshot.executions)
        scrollTo('execution')
        if (found) setDrawer(itemToDrawer(found, 'Referenced execution'))
        break
      }
      case 'context_event': {
        const found = findByRef(snapshot.context_events)
        scrollTo('context_event')
        if (found) setDrawer(contextEventToDrawer(found))
        break
      }
      case 'conversation':
        scrollTo('conversation')
        openConversationThread()
        break
      case 'belief': {
        const found = durableBeliefs.find((b) => b.subject === evidence.ref || b.subject.toLowerCase() === evidence.label.toLowerCase())
        scrollTo('belief')
        if (found) {
          setDrawer({
            title: found.subject,
            subtitle: `Durable belief · confidence ${found.confidence.toFixed(2)}`,
            fields: [
              { label: 'Value', value: String(found.value) },
              { label: 'Confidence', value: found.confidence.toFixed(2) },
              { label: 'Source', value: found.source ?? 'Not available' },
            ],
          })
        }
        break
      }
      case 'affiliation':
        scrollTo('affiliation')
        break
      case 'world_state':
      default:
        scrollTo('world_state')
        break
    }
  }

  const failureAnalysis = deriveFailureAnalysis(meta.stepFailures)

  return (
    <div className="lwe-gd">
      {isSparse && (
        <div className="lwe-gd-sparse-note">
          This execution's grounding is genuinely sparse — relationships, experiences, conversations, and prior
          executions were all queried and came back empty (see Grounding Integrity below). That's a valid result,
          not a broken one: it means nothing relevant existed yet for this actor/goal.
        </div>
      )}
      <div className="lwe-gd-meta">
        <div className="lwe-gd-meta-item">Execution ID: <b>{meta.executionId}</b></div>
        <div className="lwe-gd-meta-item">Actor: <b>{meta.actorName}</b></div>
        <div className="lwe-gd-meta-item">Goal: <b>{meta.goal || 'Not recorded'}</b></div>
        <div className="lwe-gd-meta-item">Time: <b>{meta.time ? formatTime(meta.time) : 'Not available'}</b></div>
        <div className="lwe-gd-meta-item">Status: <b style={{ color: statusColor(meta.status) }}>{meta.status || 'unknown'}</b></div>
        <button type="button" className="lwe-gd-integrity-toggle" onClick={() => setShowIntegrity((v) => !v)}>
          {showIntegrity ? 'Hide' : 'Show'} Grounding Integrity
        </button>
      </div>

      {failureAnalysis.root ? (
        <div className="lwe-gd-root-failure">
          <div className="lwe-gd-root-failure-title">
            {meta.status.toLowerCase() === 'partial' ? 'Execution Partially Failed' : 'Execution Failed'}
          </div>
          <div className="lwe-gd-root-failure-cause">
            <b>Root cause:</b> {failureAnalysis.root.step} was rejected — {failureAnalysis.root.reason}
          </div>
          {failureAnalysis.blocked.length > 0 && (
            <div className="lwe-gd-root-failure-downstream">
              <b>Downstream impact:</b> {failureAnalysis.blocked.length} dependent step
              {failureAnalysis.blocked.length === 1 ? '' : 's'} never ran because {failureAnalysis.root.step} failed first.
            </div>
          )}
          <div className="lwe-gd-root-failure-steps">
            <div className="lwe-gd-root-failure-step root">
              ✗ {failureAnalysis.root.step}
              <span className="lwe-gd-root-failure-badge">ROOT FAILURE</span>
            </div>
            {failureAnalysis.blocked.map((step, i) => (
              <div key={i} className="lwe-gd-root-failure-step blocked">
                ○ {step}
                <span className="lwe-gd-root-failure-badge">BLOCKED</span>
              </div>
            ))}
          </div>
        </div>
      ) : (meta.stepFailures?.length || meta.failureReason) && (
        <div className="lwe-gd-failures">
          <div className="lwe-gd-failures-title">
            {meta.status.toLowerCase() === 'partial' ? 'What failed (partial)' : 'What failed'}
          </div>
          {meta.stepFailures && meta.stepFailures.length > 0 ? (
            <ul>
              {meta.stepFailures.map((f, i) => {
                const [step, ...rest] = f.split(': ')
                return <li key={i}><b>{step}</b>{rest.length > 0 ? `: ${rest.join(': ')}` : ''}</li>
              })}
            </ul>
          ) : (
            <div>{meta.failureReason}</div>
          )}
        </div>
      )}

      {showIntegrity && <GroundingIntegrityPanel snapshot={snapshot} semanticMemory={semanticMemory} meta={meta} />}

      <div className="lwe-gd-metrics">
        <Metric accent="#1D4ED8" icon="◈" value={snapshot.knowledge.length} label="Grounding Context (entities)"
          hint={`${snapshot.relationships.length} relationships · ${experiences.length} experiences · ${conversations.length} conversations · ${snapshot.executions.length} prior executions · ${snapshot.context_events.length} events · ${snapshot.prompt_tokens} prompt tokens`} />
        <Metric accent="#1D4ED8" icon="⬡" value={snapshot.knowledge.length} unit="Retrieved" label="Knowledge Graph Entities" delta={delta('knowledge')} />
        <Metric accent="#6D28D9" icon="⇄" value={snapshot.relationships.length} unit="Retrieved" label="Relationships Traversed" delta={delta('relationships')} />
        <Metric accent="#047857" icon="◐" value={experiences.length} unit="Retrieved" label="Experiences Retrieved" delta={delta('experiences')} />
        <Metric accent="#475569" icon="✉" value={conversations.length} unit="Messages" label="Conversations Retrieved" delta={delta('conversations')} />
        <Metric accent="#B45309" icon="▤" value={snapshot.executions.length} unit="Executions" label="Executions Referenced" delta={delta('executions')} />
      </div>

      <Card title="Context Diff (vs. this goal's previous planning cycle)" compact
        subtitle={diff?.is_first_context ? 'No previous grounding snapshot available for comparison — this is the first time this exact goal was planned.' : 'What the planner\'s grounding gained and lost since this goal was last planned.'}>
        {diff && !diff.is_first_context ? (
          <div className="lwe-gd-diff-grid">
            {DIFF_SOURCE_ORDER.map((source) => (
              <div className="lwe-gd-diff-item" key={source}>
                <div className="lwe-gd-diff-label">{DIFF_SOURCE_LABEL[source]}</div>
                <div className="lwe-gd-diff-buttons">
                  <button type="button" className="lwe-gd-diff-btn add" disabled={addedCount(source) === 0} onClick={() => openDiffList(source, 'added')}>+{addedCount(source)} Added</button>
                  <button type="button" className="lwe-gd-diff-btn rem" disabled={removedCount(source) === 0} onClick={() => openDiffList(source, 'removed')}>−{removedCount(source)} Removed</button>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="lwe-gd-card-empty">Nothing to compare yet.</div>}
      </Card>

      {causalChain.length > 0 && (
        <div className="lwe-gd-causal">
          {causalChain.map((step, i) => (
            <span key={i} className="lwe-gd-causal-step-wrap">
              {i > 0 && <span className="lwe-gd-causal-arrow">→</span>}
              <span className="lwe-gd-causal-step">
                <span className="lwe-gd-causal-label">{step.label}</span>
                <span className="lwe-gd-causal-detail">{step.detail}</span>
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="lwe-gd-grid">
        <div className={`span-8${flashCard === 'knowledge' ? ' lwe-gd-flash' : ''}`} ref={cardRefs.knowledge}>
          <Card title="Knowledge Graph" subtitle={`${snapshot.knowledge.length} Entities Retrieved`} reason={RETRIEVAL_REASON.knowledge} action="View Graph" onAction={onViewGraph}>
            <GroundingKnowledgeGraphCard knowledge={snapshot.knowledge} relationships={snapshot.relationships} onOpenDetail={setDrawer} onViewGraph={onViewGraph} highlightedRelationshipId={selectedRelationshipId} />
            <div className="lwe-gd-card-title" style={{ marginTop: 14, fontSize: 11 }}>Recent Entities</div>
            {snapshot.knowledge.length === 0 ? <div className="lwe-gd-card-empty">None retrieved.</div> : (
              <div style={{ marginTop: 4 }}>
                {[...snapshot.knowledge].sort((a, b) => b.timestamp - a.timestamp).slice(0, 6).map((item, i) => (
                  <Row key={i} accent="#1D4ED8" dot main={item.content} time={formatTime(item.timestamp)} onClick={() => setDrawer(itemToDrawer(item, item.content.split(' (')[0]))} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className={`span-4${flashCard === 'relationship' ? ' lwe-gd-flash' : ''}`} ref={cardRefs.relationship}>
          <Card title="Relationships" subtitle={`${snapshot.relationships.length} Relationships Traversed`} reason={RETRIEVAL_REASON.relationships}>
            {snapshot.relationships.length === 0 ? <div className="lwe-gd-card-empty">{emptyBecause('knowledge_graph', 'The knowledge graph query found no relationships between the retrieved entities')}</div> : (<>
              {relationshipsShown.map((item, i) => {
                const relId = item.evidence_ids[0]
                return (
                  <Row key={i} accent="#6D28D9" dot main={item.content} active={relId != null && relId === selectedRelationshipId}
                    onClick={() => { setSelectedRelationshipId((cur) => (cur === relId ? null : relId ?? null)); setDrawer(itemToDrawer(item, 'Relationship')) }} />
                )
              })}
              {relationshipsMoreCount > 0 && <div className="lwe-gd-more">... {relationshipsMoreCount} more relationships</div>}
            </>)}
          </Card>
        </div>

        <div className={`span-6${flashCard === 'experience' ? ' lwe-gd-flash' : ''}`} ref={cardRefs.experience}>
          <Card title="Experiences (Episodic Memory)" subtitle={`${experiences.length} Retrieved`} reason={RETRIEVAL_REASON.experiences}>
            {experiences.length === 0 ? <div className="lwe-gd-card-empty">{emptyBecause('semantic_memory', 'No episodic experience matched this actor/goal')}</div> : (<>
              {experiences.slice(0, 5).map((item, i) => {
                const subParts = [
                  item.reason ? `Reason: ${item.reason}` : null,
                  item.influence != null ? `Influence: ${item.influence.toFixed(2)}` : null,
                ].filter(Boolean)
                // Real execution outcomes (kernel/pipeline/belief_runtime.py::
                // _record_episodic_experience) always prefix the text with
                // exactly one of these three — a precise, real signal, not a
                // guess. Confidence-range guessing stays as the fallback for
                // non-outcome experiences (demo/preference-style entries)
                // that were never shaped this way.
                const badge = item.content.startsWith('Failed to complete goal') ? 'Failed'
                  : item.content.startsWith('Partially completed goal') ? 'Partial'
                  : item.content.startsWith('Completed goal') ? 'Success'
                  : item.confidence >= 0.7 ? 'Success' : item.confidence >= 0.4 ? 'Preference' : 'Issue'
                return (
                  <Row key={i} accent={statusColor(badge)} main={item.content} sub={subParts.length > 0 ? subParts.join(' · ') : undefined} time={formatTime(item.timestamp)}
                    badge={badge}
                    onClick={() => setDrawer(itemToDrawer(item, 'Experience'))} />
                )
              })}
              {experiences.length > 5 && <div className="lwe-gd-more">... {experiences.length - 5} more experiences</div>}
            </>)}
          </Card>
        </div>

        <div className={`span-6${flashCard === 'belief' ? ' lwe-gd-flash' : ''}`} ref={cardRefs.belief}>
          <Card title="Actor Durable Beliefs — Persistent State" subtitle={`${durableBeliefs.length} Settled Fact${durableBeliefs.length === 1 ? '' : 's'} · this actor's full history, NOT scoped to this execution — shown as background context only`}>
            {durableBeliefs.length === 0 ? <div className="lwe-gd-card-empty">No fact has been observed enough times yet to become a durable belief.</div> : (<>
              {durableBeliefs.slice(0, 8).map((b, i) => {
                const observationCount = Number((b.metadata as { observation_count?: number })?.observation_count ?? 0)
                const subParts = [
                  b.source ? `Source: ${b.source}` : null,
                  b.start_time ? `Updated ${formatTime(b.start_time)}` : null,
                  b.end_time === null || b.end_time === undefined ? 'Active' : 'Superseded',
                ].filter(Boolean)
                return (
                  <Row key={i} accent="#6D28D9" dot main={<>{b.subject}: <b>{String(b.value)}</b></>} sub={subParts.join(' · ')}
                    badge={`conf ${b.confidence.toFixed(2)}`}
                    onClick={() => setDrawer({
                      title: b.subject,
                      subtitle: `Durable belief · confidence ${b.confidence.toFixed(2)}`,
                      fields: [
                        { label: 'Value', value: String(b.value) },
                        { label: 'Confidence', value: b.confidence.toFixed(2) },
                        { label: 'Source', value: b.source ?? 'Not available' },
                        { label: 'Last updated', value: b.start_time ? formatTime(b.start_time) : 'Not available' },
                        { label: 'Active', value: b.end_time === null || b.end_time === undefined ? 'Yes' : 'No — superseded' },
                        { label: 'Observed', value: `${observationCount} times` },
                        { label: 'Reason', value: String((b.metadata as { reason?: string })?.reason ?? '—') },
                      ],
                      list: Array.isArray((b.metadata as { evidence?: unknown[] })?.evidence)
                        ? ((b.metadata as { evidence: unknown[] }).evidence.map((e) => ({ primary: String(e) })))
                        : [],
                      listLabel: 'Evidence',
                    })} />
                )
              })}
              {durableBeliefs.length > 8 && <div className="lwe-gd-more">... {durableBeliefs.length - 8} more beliefs</div>}
            </>)}
          </Card>
        </div>

        <div className={`span-6${flashCard === 'execution' ? ' lwe-gd-flash' : ''}`} ref={cardRefs.execution}>
          <Card title="Executions Referenced" subtitle={`${snapshot.executions.length} Executions Referenced`} reason={RETRIEVAL_REASON.executions}>
            {snapshot.executions.length === 0 ? <div className="lwe-gd-card-empty">{emptyBecause('semantic_memory', 'No prior execution surfaced as relevant to this goal')}</div> : (<>
              {/* evidence_ids never carries a resolvable execution_id for real
                  items (kernel/pipeline/planning/context_engine.py's
                  _bucket_memory_nodes sets it to () for own memory, or
                  "actor:<id>" for shared memory), so real rows always open
                  the same detail drawer every other card uses. item.outcome
                  itself is demo-only (never populated for real items — see
                  contextClient.ts) but real content always ends with the
                  real "... — {outcome}" suffix _record_episodic_experience
                  writes, so that's the real signal used below instead of
                  the field that's silently always empty. */}
              {snapshot.executions.slice(0, 6).map((item, i) => {
                const suffixMatch = /—\s*(success|partial|failure)\s*$/i.exec(item.content)
                const outcome = item.outcome ?? suffixMatch?.[1]
                return (
                  <Row key={i} accent={outcome ? statusColor(outcome) : '#B45309'} main={item.content}
                    sub={item.evidence_ids[0] ? <span style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>{item.evidence_ids[0]}</span> : undefined}
                    time={formatTime(item.timestamp)}
                    badge={outcome}
                    onClick={() => setDrawer(itemToDrawer(item, 'Referenced execution'))} />
                )
              })}
            </>)}
          </Card>
        </div>

        <div className={`span-6${flashCard === 'context_event' ? ' lwe-gd-flash' : ''}`} ref={cardRefs.context_event}>
          <Card title="Context Events" subtitle={`${snapshot.context_events.length} Context Events`} reason={RETRIEVAL_REASON.context_events}>
            {snapshot.context_events.length === 0 ? <div className="lwe-gd-card-empty">{emptyBecause('context_stream', 'No context events were grounded this execution')}</div> : (
              <div className="lwe-gd-timeline">
                {snapshot.context_events.slice(0, 8).map((item, i) => {
                  const isStepFailure = item.item_type === 'step_failure'
                  // A dependency-blocked step's own event reads "X failed:
                  // blocked: dependency step N did not succeed" — that's
                  // downstream fallout, not an independent failure (see
                  // deriveFailureAnalysis above); label it accordingly
                  // instead of the same "STEP FAILED" badge as the one
                  // real root failure.
                  const isBlocked = isStepFailure && /blocked: dependency/i.test(item.content)
                  const highImpact = item.impact === 'high' || item.item_type === 'external_perturbation' || isStepFailure
                  return (
                    <div key={i} className={`lwe-gd-timeline-item${highImpact ? ' high-impact' : ''}`} onClick={() => setDrawer(contextEventToDrawer(item))}>
                      <span className="lwe-gd-timeline-dot" />
                      <div className="lwe-gd-timeline-body">
                        <div className="lwe-gd-timeline-time">{formatTime(item.timestamp)}</div>
                        <div className="lwe-gd-timeline-title">{item.source || 'Context event'}</div>
                        <div className="lwe-gd-timeline-desc">
                          {isBlocked
                            ? `${item.content.split(' failed:')[0]} blocked because an earlier step failed.`
                            : item.content}
                        </div>
                        {highImpact && (
                          <span className="lwe-gd-timeline-badge">
                            {isBlocked ? 'BLOCKED' : isStepFailure ? 'STEP FAILED' : 'HIGH IMPACT'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        <div className={`span-6${flashCard === 'conversation' ? ' lwe-gd-flash' : ''}`} ref={cardRefs.conversation}>
          <Card title="Conversations" subtitle={`${executionMessages.length} Messages Exchanged`} reason={RETRIEVAL_REASON.conversations}>
            {executionMessages.length === 0 ? <div className="lwe-gd-card-empty">No AskActor/DelegateTask messages were exchanged during this execution.</div> : (<>
              {executionMessages.slice(0, 5).map((m, i) => (
                <Row key={i} accent="#475569" dot main={m.description} time={formatTime(m.timestamp)} onClick={openConversationThread} />
              ))}
              {executionMessages.length > 5 && <div className="lwe-gd-more">... {executionMessages.length - 5} more messages</div>}
            </>)}
          </Card>
        </div>

        <div className={`span-6${flashCard === 'affiliation' ? ' lwe-gd-flash' : ''}`} ref={cardRefs.affiliation}>
          <Card
            title={affiliationChain && affiliationChain.length > 0 ? 'Actor Affiliation Context — Persistent State' : 'Affiliations Used'}
            subtitle={affiliationChain && affiliationChain.length > 0
              ? `${affiliationChain.length} actors in this actor's persistent affiliation graph — background context, NOT necessarily traversed by this execution`
              : `${snapshot.affiliations.length} affiliation${snapshot.affiliations.length === 1 ? '' : 's'} actually captured during this execution's grounding`}
            action="View Graph" onAction={onViewAffiliations}>
            {affiliationChain && affiliationChain.length > 0 ? (
              <div className="lwe-gd-chain">
                {affiliationChain.map((node, i) => (
                  <span key={node.id} style={{ display: 'contents' }}>
                    {i > 0 && <span className="lwe-gd-chain-arrow" title={node.edgeLabel}>→</span>}
                    <div className="lwe-gd-chain-node" title={node.edgeLabel}
                      onClick={() => setDrawer({ title: node.name, subtitle: node.entityType, fields: node.edgeLabel ? [{ label: 'Relationship', value: node.edgeLabel }] : [] })}>
                      {node.name}
                      <small>{node.entityType}</small>
                    </div>
                  </span>
                ))}
              </div>
            ) : snapshot.affiliations.length === 0 ? <div className="lwe-gd-card-empty">Affiliation graph was not queried for this execution.</div> : (
              <div className="lwe-gd-chain">
                <div className="lwe-gd-chain-node">{meta.actorName}</div>
                {snapshot.affiliations.slice(0, 6).map((a, i) => (
                  <span key={i} style={{ display: 'contents' }}>
                    <span className="lwe-gd-chain-arrow">→</span>
                    <div className="lwe-gd-chain-node" onClick={() => setDrawer({
                      title: String(a.society_name || a.society_id || 'Affiliation'),
                      fields: [
                        { label: 'Roles', value: Array.isArray(a.roles) ? a.roles.join(', ') : String(a.roles ?? '—') },
                        { label: 'Trust score', value: String(a.trust_score ?? '—') },
                        { label: 'Permissions', value: Array.isArray(a.permissions) ? a.permissions.join(', ') || 'none' : String(a.permissions ?? '—') },
                      ],
                    })}>
                      {String(a.society_name || a.society_id)}
                      <small>{Array.isArray(a.roles) ? a.roles.join(', ') : ''}</small>
                    </div>
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className={`span-8${flashCard === 'world_state' ? ' lwe-gd-flash' : ''}`} ref={cardRefs.world_state}>
          <Card title="World State Used for Grounding" subtitle="The real locations, objects, and capabilities this planning cycle grounded on.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="lwe-gd-snapshot-tag">State snapshot used for grounding</div>
              <div>
                <div className="lwe-gd-card-subtitle" style={{ marginBottom: 6 }}>{snapshot.relevant_locations.length} Locations</div>
                <div className="lwe-gd-chips">
                  {snapshot.relevant_locations.length === 0 ? <span className="lwe-gd-chip lwe-gd-chip-more">None recorded</span> :
                    snapshot.relevant_locations.map((l, i) => <span className="lwe-gd-chip" key={i}>{l}</span>)}
                </div>
              </div>
              <div>
                <div className="lwe-gd-card-subtitle" style={{ marginBottom: 6 }}>{snapshot.relevant_objects.length} Objects</div>
                <div className="lwe-gd-chips">
                  {snapshot.relevant_objects.length === 0 ? <span className="lwe-gd-chip lwe-gd-chip-more">None recorded</span> :
                    snapshot.relevant_objects.slice(0, 8).map((o, i) => {
                      const detail = meta.objectDetails?.[o]
                      return (
                        <span className="lwe-gd-chip clickable" key={i} onClick={() => setDrawer({
                          title: o,
                          subtitle: detail ? 'World-state object' : undefined,
                          fields: detail
                            ? [{ label: 'Current state', value: detail.state }, { label: 'Provenance', value: detail.provenance }]
                            : [{ label: 'Current state', value: 'Not available — this planning cycle only recorded the object name' }],
                        })}>{o}</span>
                      )
                    })}
                  {snapshot.relevant_objects.length > 8 && <span className="lwe-gd-chip lwe-gd-chip-more">+{snapshot.relevant_objects.length - 8} more</span>}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="span-4">
          <Card title="External Events" subtitle={`${external.length} External Event${external.length === 1 ? '' : 's'}`}>
            {external.length === 0 ? <div className="lwe-gd-card-empty">No external perturbations were reported for this execution.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {external.slice(0, 3).map((item, i) => (
                  <div className="lwe-gd-external" key={i} onClick={() => setDrawer(contextEventToDrawer(item))}>
                    <div className="lwe-gd-external-head">⚠ {formatTime(item.timestamp)}</div>
                    <div className="lwe-gd-external-desc">{item.content}</div>
                    <div className="lwe-gd-external-sub">Source: {item.source || 'unknown'}</div>
                    {item.affectedEntities?.length ? <div className="lwe-gd-external-row">Affected entity: <b>{item.affectedEntities.join(', ')}</b></div> : null}
                    {item.affectedLocation ? <div className="lwe-gd-external-row">Affected location: <b>{item.affectedLocation}</b></div> : null}
                    {item.previousState && item.newState ? <div className="lwe-gd-external-row">World-state change: <b>{item.previousState} → {item.newState}</b></div> : null}
                    {item.groundingImpact ? <div className="lwe-gd-external-row">Grounding impact: <b>{item.groundingImpact}</b></div> : null}
                    {item.planningImpact ? <div className="lwe-gd-external-row">Planning impact: <b>{item.planningImpact}</b></div> : null}
                    {item.impact && <span className="lwe-gd-external-badge">{item.impact.toUpperCase()} IMPACT</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ExecutionSecurityTrace actorId={snapshot.actor_id} executionId={meta.executionId} />

      <GroundingDetailDrawer content={drawer} onClose={() => setDrawer(null)} />

      <ExecutionChatPanel
        executionId={meta.executionId}
        actorId={snapshot.actor_id}
        actorName={meta.actorName}
        goal={meta.goal}
        status={meta.status}
        snapshot={snapshot}
        semanticMemory={semanticMemory}
        affiliationChain={affiliationChain}
        causalChain={causalChain}
        selectedLabel={selectedLabel}
        onEvidenceClick={onEvidenceClick}
      />
    </div>
  )
}
