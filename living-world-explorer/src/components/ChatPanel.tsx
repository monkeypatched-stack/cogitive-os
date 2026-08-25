import { useEffect, useRef, useState } from 'react'
import { PanelContainer } from './PanelContainer'
import { useWorldStore } from '../store/worldStore'
import { useRefreshStore } from '../store/refreshStore'
import { sendActorPrompt, addActorGoal, chatWithActor, looksLikeQuestion } from '../api/promptClient'
import './ChatPanel.css'

interface ChatMessage {
  id: string
  role: 'user' | 'actor' | 'error'
  text: string
  meta?: string
  timestamp: number
}

/**
 * Real trigger, not a mock chatbot — auto-routed by a real, local
 * heuristic (looksLikeQuestion, promptClient.ts):
 *
 * - A question ("what's...", "how much...", trailing "?") gets a real,
 *   grounded answer from POST /actors/{id}/chat: this actor's own real
 *   KG facts first, then a real Tavily web search if the KG had nothing,
 *   then a plain (honestly labeled) ungrounded LLM answer as the last
 *   resort. No planetary tick runs for a question — nothing changes in
 *   the simulation, it's read-only.
 * - Anything else is queued as a real, persistent goal via
 *   POST /actors/{id}/goals (CognitiveActor.add_goal()), then
 *   POST /prompt runs the target actor's actual next planetary tick
 *   against it — the same pipeline the Actor Inspector's Intent/Plan/
 *   Beliefs/Decision sections read from. Unlike /prompt's own question
 *   field (a one-tick triggering phrase the actor forgets immediately
 *   after), the goal persists: it stays queued (and survives a restart)
 *   until the actor completes or replaces it.
 *
 * Requires the target actor to currently have an open Presence at a
 * Space and active Society membership for the goal/tick path — an actor
 * without one gets a real, honest error back (query_result.llm_answered
 * === false), not a fabricated success.
 */
export function ChatPanel() {
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const actorsById = useWorldStore((s) => s.actorsById)
  const selectActor = useWorldStore((s) => s.selectActor)
  const fetchEntities = useWorldStore((s) => s.fetchEntities)

  const [messagesByActor, setMessagesByActor] = useState<Record<string, ChatMessage[]>>({})
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendingMode, setSendingMode] = useState<'chat' | 'goal' | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const refreshSeq = useRefreshStore((s) => s.refreshSeq)

  // Real bug this fixes: actorsById is only ever populated by
  // fetchEntities(), which WorldTree/MapView call on mount — neither of
  // which is mounted alongside ChatPanel on its own page
  // (/execution-debugger/overview), so the actor picker below was
  // silently empty (just the placeholder option) whenever this panel
  // was reached directly, with no error and no visible sign anything
  // was wrong. Same effect shape WorldTree already uses (fetch on mount,
  // and again whenever refreshSeq bumps — including this panel's own
  // bumpRefresh() after a real send, below), so the actor list also
  // stays current with whatever a chat-triggered tick just changed.
  useEffect(() => {
    fetchEntities()
  }, [fetchEntities, refreshSeq])

  const actor = selectedActorId ? actorsById[selectedActorId] : null
  const messages = selectedActorId ? messagesByActor[selectedActorId] ?? [] : []
  const actorOptions = Object.values(actorsById)
    .filter((a) => a.actor_type !== 'digital_service')
    .sort((a, b) => a.name.localeCompare(b.name))

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  const appendMessage = (actorId: string, message: ChatMessage) => {
    setMessagesByActor((prev) => ({ ...prev, [actorId]: [...(prev[actorId] ?? []), message] }))
  }

  const send = async () => {
    const text = input.trim()
    if (!text || !selectedActorId || sending) return
    setInput('')
    appendMessage(selectedActorId, { id: `u-${Date.now()}`, role: 'user', text, timestamp: Date.now() })
    setSending(true)

    if (looksLikeQuestion(text)) {
      setSendingMode('chat')
      try {
        const chat = await chatWithActor(selectedActorId, text)
        const meta = chat.source === 'knowledge_graph'
          ? `Grounded in ${chat.facts_used.length} known fact${chat.facts_used.length === 1 ? '' : 's'}`
          : chat.source === 'web_search'
            ? `Web search · ${chat.web_results.length} result${chat.web_results.length === 1 ? '' : 's'}`
            : 'General knowledge — not grounded in a specific fact'
        appendMessage(selectedActorId, {
          id: `a-${Date.now()}`, role: 'actor', text: chat.answer, meta, timestamp: Date.now(),
        })
      } catch (err) {
        appendMessage(selectedActorId, {
          id: `e-${Date.now()}`, role: 'error',
          text: err instanceof Error ? err.message : String(err),
          timestamp: Date.now(),
        })
      } finally {
        setSending(false)
        setSendingMode(null)
      }
      return
    }

    setSendingMode('goal')
    try {
      let goalQueued = false
      try {
        await addActorGoal(selectedActorId, text)
        goalQueued = true
      } catch {
        // Goal persistence failing shouldn't block the tick itself —
        // the actor still gets triggered below, just without this
        // message surviving past it (same as the old behavior).
      }
      const response = await sendActorPrompt(selectedActorId, text)
      const result = response.query_result
      if (result && result.llm_answered) {
        const execution = result.actor_execution
        const actionCount = execution?.actions?.length ?? 0
        const goalAchieved = execution?.actual_outcome?.goal_achieved
        const meta = (goalQueued ? 'Goal added · ' : '') +
          `${actionCount} action${actionCount === 1 ? '' : 's'} executed` +
          (goalAchieved === undefined ? '' : ` · goal ${goalAchieved ? 'achieved' : 'not achieved'}`)
        appendMessage(selectedActorId, {
          id: `a-${Date.now()}`, role: 'actor', text: result.answer, meta, timestamp: Date.now(),
        })
        // A real tick just ran for this actor — every panel showing its
        // state (Inspector, Map, World Tree, Conversation Timeline,
        // Event Stream, Execution Graph) refetches immediately.
        useRefreshStore.getState().bumpRefresh()
      } else {
        appendMessage(selectedActorId, {
          id: `e-${Date.now()}`, role: 'error',
          text: result?.answer || 'The planetary cycle did not run for this message.',
          meta: response.error_lines.length ? response.error_lines.join(' · ') : undefined,
          timestamp: Date.now(),
        })
      }
    } catch (err) {
      appendMessage(selectedActorId, {
        id: `e-${Date.now()}`, role: 'error',
        text: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      })
    } finally {
      setSending(false)
      setSendingMode(null)
    }
  }

  return (
    <PanelContainer title="Agent Chat">
      <div className="lwe-chat">
        <div className="lwe-chat-actor-picker">
          <label htmlFor="lwe-chat-actor-select">Actor</label>
          <select
            id="lwe-chat-actor-select"
            value={selectedActorId ?? ''}
            onChange={(e) => selectActor(e.target.value || null)}
          >
            <option value="">Select an actor to trigger...</option>
            {actorOptions.map((a) => (
              <option key={a.actor_id} value={a.actor_id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="lwe-chat-messages" ref={listRef}>
          {!selectedActorId && <div className="lwe-chat-empty">Select an actor above to trigger it with a message.</div>}
          {selectedActorId && messages.length === 0 && (
            <div className="lwe-chat-empty">No messages yet with {actor?.name ?? selectedActorId}.</div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`lwe-chat-message lwe-chat-message-${message.role}`}>
              <div className="lwe-chat-message-text">{message.text}</div>
              {message.meta && <div className="lwe-chat-message-meta">{message.meta}</div>}
              <div className="lwe-chat-message-time">{new Date(message.timestamp).toLocaleTimeString()}</div>
            </div>
          ))}
          {sending && (
            <div className="lwe-chat-message lwe-chat-message-actor lwe-chat-message-pending">
              {sendingMode === 'chat' ? 'Thinking...' : 'Running planetary tick...'}
            </div>
          )}
        </div>

        <div className="lwe-chat-input">
          <input
            type="text"
            placeholder={selectedActorId ? 'Message this actor...' : 'Select an actor first'}
            value={input}
            disabled={!selectedActorId || sending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
            }}
          />
          <button type="button" onClick={send} disabled={!selectedActorId || sending || !input.trim()}>
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </PanelContainer>
  )
}
