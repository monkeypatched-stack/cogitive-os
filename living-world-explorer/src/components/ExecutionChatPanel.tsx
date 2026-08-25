import { useEffect, useRef, useState } from 'react'
import type { ContextSnapshotDto, SemanticMemoryDto } from '../api/contextClient'
import { externalEventsFrom } from '../api/contextClient'
import {
  fetchExecutionChatReply, type ExecutionChatEvidence, type ExecutionChatContext,
  fetchGoalDraft, type GoalDraft,
  fetchWebSearchChat, type WebSearchSource,
} from '../api/executionChatClient'
import { addActorGoal, sendActorPrompt } from '../api/promptClient'
import { fetchActorGoals } from '../api/actorClient'
import { useRefreshStore } from '../store/refreshStore'
import './ExecutionChatPanel.css'

// The Assistant is exactly three modes, never a generic multi-tool agent
// (see the spec this implements): Goal (define/refine a structured goal,
// never executes anything), LLM/RAG (CognitiveOS's own internal
// knowledge/memory/grounding), Web Search (external/current information
// only). The three never silently mix — each mode's send path calls
// exactly one backend route and never calls another mode's route.
type AssistantMode = 'goal' | 'llm_rag' | 'web_search'

interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
  trace?: string[]
  evidence?: ExecutionChatEvidence[]
  sources?: WebSearchSource[]
}

const EMPTY_DRAFT: GoalDraft = { objective: '', actor: '', constraints: [], preferences: [], success_conditions: [] }

// Keyed by `${executionId}:${mode}` — switching modes never deletes a
// conversation (spec section 10), it just shows that mode's own thread;
// switching back to a previous mode restores exactly where it left off.
const threadsByKey = new Map<string, AssistantMessage[]>()
// A goal draft is actor-scoped, not execution-scoped — refining "buy milk
// under $10" should survive navigating to a different execution for the
// same actor, unlike the RAG conversation which is legitimately about
// ONE specific execution.
const goalDraftsByActor = new Map<string, GoalDraft>()
const createdGoalTextByActor = new Map<string, string | null>()

const PLACEHOLDER_BY_MODE: Record<AssistantMode, string> = {
  goal: 'Define or refine a goal...',
  llm_rag: 'Ask CognitiveOS about your knowledge, memory, or execution...',
  web_search: 'Search the web for current information...',
}

const MODE_LABEL: Record<AssistantMode, string> = { goal: 'Goal', llm_rag: 'LLM / RAG', web_search: 'Web Search' }

const GOAL_SUGGESTIONS = ['Define a new goal', 'Refine the current goal', 'Add a constraint', 'Add a preference', 'Show current goal']
const WEB_SEARCH_SUGGESTIONS = ['Search current prices', 'Find available providers', 'Search current product availability', 'Find relevant external information', 'Compare current options']

function buildContext(snapshot: ContextSnapshotDto, semanticMemory: SemanticMemoryDto | null, affiliationChain?: ExecutionChatContext['affiliation_chain'], causalChain?: ExecutionChatContext['causal_chain']): ExecutionChatContext {
  return {
    knowledge: snapshot.knowledge,
    relationships: snapshot.relationships,
    context_events: snapshot.context_events,
    experiences: semanticMemory?.retrieved_this_execution.experiences ?? [],
    conversations: semanticMemory?.retrieved_this_execution.conversations ?? [],
    executions: snapshot.executions,
    relevant_locations: snapshot.relevant_locations,
    relevant_objects: snapshot.relevant_objects,
    durable_beliefs: semanticMemory?.durable_beliefs ?? [],
    affiliation_chain: affiliationChain,
    diff_from_previous: snapshot.diff_from_previous,
    causal_chain: causalChain,
  }
}

// LLM/RAG's own suggestions stay dynamic/data-driven (unchanged from
// before this mode split existed) — Goal and Web Search use the spec's
// fixed lists instead, since neither depends on this execution's
// snapshot contents.
function buildRagSuggestions(snapshot: ContextSnapshotDto, semanticMemory: SemanticMemoryDto | null, selectedLabel?: string | null): string[] {
  const experiences = semanticMemory?.retrieved_this_execution.experiences ?? []
  const conversations = semanticMemory?.retrieved_this_execution.conversations ?? []
  const external = externalEventsFrom(snapshot)
  const s: string[] = []
  if (selectedLabel) {
    s.push(`Why was ${selectedLabel} selected?`, `What relationships does ${selectedLabel} have?`)
  }
  s.push('Why did this plan execute?')
  if (external.length > 0) s.push('What changed in the world?')
  if (experiences.length > 0) s.push('What memories influenced this?')
  if (snapshot.executions.length > 0) s.push('What did a previous execution teach us?')
  if (snapshot.diff_from_previous && !snapshot.diff_from_previous.is_first_context) s.push('Show grounding changes')
  if (conversations.length > 0) s.push('What did the conversation say?')
  s.push('Explain the execution outcome')
  return s.slice(0, 6)
}

function synthesizeGoalText(d: GoalDraft): string {
  let text = d.objective.trim()
  if (d.constraints.length) text += ` Constraints: ${d.constraints.join('; ')}.`
  if (d.preferences.length) text += ` Preferences: ${d.preferences.join('; ')}.`
  if (d.success_conditions.length) text += ` Success conditions: ${d.success_conditions.join('; ')}.`
  return text.trim()
}

export function ExecutionChatPanel({
  executionId, actorId, actorName, goal, status, snapshot, semanticMemory,
  affiliationChain, causalChain, selectedLabel, onEvidenceClick,
}: {
  executionId: string
  actorId: string
  actorName: string
  goal: string
  status: string
  snapshot: ContextSnapshotDto
  semanticMemory: SemanticMemoryDto | null
  affiliationChain?: ExecutionChatContext['affiliation_chain']
  causalChain?: ExecutionChatContext['causal_chain']
  selectedLabel?: string | null
  onEvidenceClick: (evidence: ExecutionChatEvidence) => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AssistantMode>('llm_rag')
  const [messages, setMessages] = useState<AssistantMessage[]>(() => threadsByKey.get(`${executionId}:llm_rag`) ?? [])
  const [draft, setDraft] = useState<GoalDraft>(() => goalDraftsByActor.get(actorId) ?? EMPTY_DRAFT)
  const [createdGoalText, setCreatedGoalText] = useState<string | null>(() => createdGoalTextByActor.get(actorId) ?? null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const threadKey = `${executionId}:${mode}`
  const lastThreadKeyRef = useRef(threadKey)
  const lastActorRef = useRef(actorId)

  // A genuine thread switch (execution OR mode change) loads that
  // thread's own messages — the old one stays in the map, untouched.
  useEffect(() => {
    if (lastThreadKeyRef.current === threadKey) return
    lastThreadKeyRef.current = threadKey
    setMessages(threadsByKey.get(threadKey) ?? [])
    setError(null)
  }, [threadKey])

  useEffect(() => {
    threadsByKey.set(threadKey, messages)
  }, [threadKey, messages])

  // A real actor switch reloads that actor's own goal draft (surviving
  // across execution navigation for the same actor, per the draft's own
  // actor-scoped design above).
  useEffect(() => {
    if (lastActorRef.current === actorId) return
    lastActorRef.current = actorId
    setDraft(goalDraftsByActor.get(actorId) ?? EMPTY_DRAFT)
    setCreatedGoalText(createdGoalTextByActor.get(actorId) ?? null)
  }, [actorId])

  useEffect(() => { goalDraftsByActor.set(actorId, draft) }, [actorId, draft])
  useEffect(() => { createdGoalTextByActor.set(actorId, createdGoalText) }, [actorId, createdGoalText])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading, open])

  const entityCount = snapshot.knowledge.length
  const relCount = snapshot.relationships.length
  const memoryCount = (semanticMemory?.retrieved_this_execution.experiences.length ?? 0) + (semanticMemory?.durable_beliefs.length ?? 0)
  const eventCount = snapshot.context_events.length

  const appendAssistant = (msg: AssistantMessage) => setMessages((cur) => [...cur, msg])

  const sendRag = async (question: string, historyForRequest: AssistantMessage[]) => {
    try {
      const reply = await fetchExecutionChatReply(actorId, executionId, {
        execution_id: executionId, actor_id: actorId, actor_name: actorName, goal, status,
        question,
        history: historyForRequest.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        selected_context: selectedLabel ?? null,
        context: buildContext(snapshot, semanticMemory, affiliationChain, causalChain),
      })
      appendAssistant({ role: 'assistant', content: reply.answer, evidence: reply.evidence })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const sendWebSearch = async (query: string) => {
    try {
      const reply = await fetchWebSearchChat(actorId, query)
      appendAssistant({
        role: 'assistant', content: reply.answer, sources: reply.sources,
        trace: [`Query: ${query}`, `Sources: ${reply.sources.length}`, 'Retrieved: just now'],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const sendGoal = async (message: string) => {
    try {
      const reply = await fetchGoalDraft(actorId, message, draft)
      setDraft(reply.draft)
      appendAssistant({ role: 'assistant', content: reply.update_summary || 'Draft updated.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const viewGoal = async () => {
    setError(null)
    setLoading(true)
    try {
      const result = await fetchActorGoals(actorId)
      appendAssistant({
        role: 'assistant',
        content: result.goals.length
          ? `Current goals for ${actorName}:\n${result.goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}`
          : `No goals recorded yet for ${actorName}.`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const createOrUpdateGoal = async () => {
    if (!draft.objective.trim()) return
    const text = synthesizeGoalText(draft)
    const previousText = createdGoalText
    setError(null)
    setLoading(true)
    try {
      // replace_goal (the previously-persisted string, if this is an
      // Update) removes the old queued entry server-side instead of
      // leaving near-duplicates ("2L milk...", "1L milk...") stacking up.
      await addActorGoal(actorId, text, previousText ?? undefined)
      setCreatedGoalText(text)
      appendAssistant({ role: 'assistant', content: `${previousText ? 'Goal updated' : 'Goal created'}: "${text}"` })

      // Goal mode's conversational refinement never executes anything on
      // its own (fetchGoalDraft above never does) — but Create/Update is
      // an explicit, operator-initiated action, so it also triggers a
      // real tick, the same way the plain Agent Chat panel
      // (ChatPanel.tsx) already does right after queuing a goal, reusing
      // that same sendActorPrompt call rather than inventing a second
      // execution path.
      const response = await sendActorPrompt(actorId, text)
      const result = response.query_result
      if (result && result.llm_answered) {
        const execution = result.actor_execution
        const actionCount = execution?.actions?.length ?? 0
        const goalAchieved = execution?.actual_outcome?.goal_achieved
        appendAssistant({
          role: 'assistant', content: result.answer,
          trace: [
            `${actionCount} action${actionCount === 1 ? '' : 's'} executed` +
            (goalAchieved === undefined ? '' : ` · goal ${goalAchieved ? 'achieved' : 'not achieved'}`),
          ],
        })
        // A real tick just ran for this actor — the debugger's own data
        // (execution list, snapshot, semantic memory) only refetches on
        // a refreshSeq bump (DataSourcesPanel.tsx), same as the plain
        // Agent Chat panel (ChatPanel.tsx) already does after its own
        // tick. Without this, the new execution existed in the backend
        // but the debugger kept showing whatever was selected before.
        useRefreshStore.getState().bumpRefresh()
      } else {
        appendAssistant({ role: 'assistant', content: result?.answer || 'The planetary cycle did not run for this goal.' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    if (mode === 'goal' && trimmed === 'Show current goal') {
      setInput('')
      void viewGoal()
      return
    }
    const userMsg: AssistantMessage = { role: 'user', content: trimmed }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setError(null)
    setLoading(true)
    const run = mode === 'goal' ? sendGoal(trimmed)
      : mode === 'web_search' ? sendWebSearch(trimmed)
        : sendRag(trimmed, nextMessages)
    void run.finally(() => setLoading(false))
  }

  const retry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser) send(lastUser.content)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }

  if (!open) {
    return (
      <button type="button" className="lwe-echat-fab" onClick={() => setOpen(true)} title="Open the CognitiveOS Assistant">
        <span className="lwe-echat-fab-icon">💬</span>
        <span className="lwe-echat-fab-text">CognitiveOS<br />Assistant</span>
      </button>
    )
  }

  const suggestions = mode === 'goal' ? GOAL_SUGGESTIONS
    : mode === 'web_search' ? WEB_SEARCH_SUGGESTIONS
      : buildRagSuggestions(snapshot, semanticMemory, selectedLabel)

  const emptyStateText = mode === 'goal'
    ? "Tell me what you want to accomplish and I'll help define a structured goal — objective, constraints, preferences, and success conditions. Nothing is created until you choose Create Goal."
    : mode === 'web_search'
      ? 'I can search the web for current, external information — prices, availability, news. This never touches CognitiveOS\'s own knowledge or memory.'
      : selectedLabel
        ? `You're inspecting ${selectedLabel}. I can explain its state, relationships, history, and role in this execution.`
        : 'I can explain this execution, its grounding context, plan, world changes, and outcome. What would you like to know?'

  return (
    <div className="lwe-echat-panel">
      <div className="lwe-echat-header">
        <div>
          <div className="lwe-echat-title">CognitiveOS Assistant</div>
          <div className="lwe-echat-subtitle">Execution Debugger · <span className="mono">{executionId}</span></div>
        </div>
        <div className="lwe-echat-header-actions">
          <button type="button" onClick={() => setOpen(false)} title="Minimize" aria-label="Minimize">–</button>
          <button type="button" onClick={() => setOpen(false)} title="Close" aria-label="Close">✕</button>
        </div>
      </div>

      <div className="lwe-echat-status">
        <span className="lwe-echat-status-dot" /> Grounding context loaded
      </div>

      <div className="lwe-echat-modes" role="tablist" aria-label="Assistant mode">
        {(['goal', 'llm_rag', 'web_search'] as AssistantMode[]).map((m) => (
          <button
            key={m} type="button" role="tab" aria-selected={mode === m}
            className={`lwe-echat-mode-btn${mode === m ? ' active' : ''}`}
            onClick={() => setMode(m)}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {mode === 'llm_rag' && (
        <div className="lwe-echat-context-indicator">
          Grounded in current execution — {entityCount} entities · {relCount} relationships · {memoryCount} memories · {eventCount} events
        </div>
      )}

      {mode === 'goal' && (
        <div className="lwe-echat-goal-card">
          <div className="lwe-echat-goal-title">Goal</div>
          <div className="lwe-echat-goal-field"><span>Objective</span>{draft.objective || '—'}</div>
          <div className="lwe-echat-goal-field"><span>Actor</span>{draft.actor || actorName}</div>
          <div className="lwe-echat-goal-field"><span>Constraints</span>{draft.constraints.length ? draft.constraints.join(', ') : '—'}</div>
          <div className="lwe-echat-goal-field"><span>Preferences</span>{draft.preferences.length ? draft.preferences.join(', ') : '—'}</div>
          <div className="lwe-echat-goal-field"><span>Success Conditions</span>{draft.success_conditions.length ? draft.success_conditions.join(', ') : '—'}</div>
          <div className="lwe-echat-goal-actions">
            <button type="button" disabled={!draft.objective.trim() || loading} onClick={() => void createOrUpdateGoal()}>
              {createdGoalText ? 'Update Goal' : 'Create Goal'}
            </button>
            <button type="button" disabled={loading} onClick={() => void viewGoal()}>View Goal</button>
          </div>
        </div>
      )}

      <div className="lwe-echat-messages" ref={scrollRef}>
        {messages.length === 0 && <div className="lwe-echat-bubble assistant">{emptyStateText}</div>}
        {messages.map((m, i) => (
          <div className={`lwe-echat-bubble ${m.role}`} key={i}>
            {m.trace && (
              <div className="lwe-echat-trace">
                {m.trace.map((line, j) => <div key={j}>{line}</div>)}
              </div>
            )}
            {m.content}
            {m.evidence && m.evidence.length > 0 && (
              <div className="lwe-echat-evidence">
                {m.evidence.map((e, j) => (
                  <button type="button" key={j} className="lwe-echat-evidence-chip" onClick={() => onEvidenceClick(e)}>
                    [{e.label}]
                  </button>
                ))}
              </div>
            )}
            {m.sources && m.sources.length > 0 && (
              <div className="lwe-echat-evidence">
                {m.sources.map((s, j) => (
                  <a key={j} className="lwe-echat-evidence-chip" href={s.url} target="_blank" rel="noreferrer" title={s.title}>
                    [Source {j + 1}]
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="lwe-echat-bubble assistant reasoning">
            <span className="lwe-echat-reasoning-dot" /><span className="lwe-echat-reasoning-dot" /><span className="lwe-echat-reasoning-dot" />
            CognitiveOS is reasoning...
          </div>
        )}
        {error && (
          <div className="lwe-echat-bubble error">
            Couldn't reach CognitiveOS: {error}
            <button type="button" className="lwe-echat-retry" onClick={retry}>Retry</button>
          </div>
        )}
      </div>

      {messages.length === 0 && !loading && (
        <div className="lwe-echat-suggestions">
          {suggestions.map((s) => (
            <button type="button" key={s} className="lwe-echat-chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      <div className="lwe-echat-input-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={PLACEHOLDER_BY_MODE[mode]}
          rows={1}
        />
        <button type="button" className="lwe-echat-send" disabled={!input.trim() || loading} onClick={() => send(input)}>↑</button>
      </div>
    </div>
  )
}
