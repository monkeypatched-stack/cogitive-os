import { useEffect, useMemo, useState } from 'react'
import { fetchSocieties, fetchSocietyContext, type SocietyContextEvent } from '../api/actorClient'
import { useWorldStore } from '../store/worldStore'
import { useRefreshStore } from '../store/refreshStore'
import './ConversationTimelinePanel.css'

interface Conversation {
  id: string
  sender: string
  recipient: string
  timestamp: number
  thread: string
  detail: string
  actorIds: string[]
}

interface ConversationMessage {
  id: string
  sender: string
  recipient: string
  text: string
  timestamp: number
  state: 'typing' | 'reply' | 'complete'
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return '—'
}

// The real message content, in whichever shape this event's real
// source actually populated — AskActor publishes question+answer
// together (a full real exchange, shown as both); BroadcastToAffiliation/
// RespondToInquiry/RecordAgreement (kernel/society/runtime.py::
// _publish_message_interaction) and direct /planet/interactions
// (topic/proposal) each populate only their own real field.
function messageContent(payload: Record<string, unknown>, description: string | undefined): string {
  const question = payload.question && typeof payload.question === 'string' ? payload.question : ''
  const answer = payload.answer && typeof payload.answer === 'string' ? payload.answer : ''
  if (question && answer) return `Q: ${question} — A: ${answer}`
  if (question) return question
  if (answer) return answer
  const message = payload.message && typeof payload.message === 'string' ? payload.message : ''
  if (message) return message
  const topic = payload.topic && typeof payload.topic === 'string' ? payload.topic : ''
  if (topic) return topic
  return description || ''
}

function toConversation(event: SocietyContextEvent, societyName: string, index: number): Conversation | null {
  if ((event.event_type || '').toLowerCase() !== 'interaction') return null
  const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {}
  const participants = Array.isArray(payload.participants) ? payload.participants.filter((item): item is string => typeof item === 'string') : []
  const sender = text(payload.from_actor_name || payload.sender_name || payload.from_actor_id || event.actor_id)
  const recipient = text(payload.to_actor_name || payload.recipient_name || payload.to_actor_id || participants.find((id) => id !== event.actor_id))
  const senderId = text(payload.from_actor_id || event.actor_id)
  const recipientId = text(payload.to_actor_id || participants.find((id) => id !== event.actor_id))
  return {
    id: event.event_id || `conversation-${societyName}-${event.timestamp || index}`,
    sender, recipient, timestamp: event.timestamp || Date.now() / 1000,
    thread: text(payload.thread_id || payload.interaction_id || payload.thread || societyName),
    detail: text(messageContent(payload, event.description)),
    actorIds: [...new Set([senderId, recipientId, ...participants].filter((id) => id !== '—'))],
  }
}

export function ConversationTimelinePanel() {
  const highlightActors = useWorldStore((s) => s.highlightActors)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [thread, setThread] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [animation, setAnimation] = useState<{ conversation: Conversation; phase: ConversationMessage['state']; messages: ConversationMessage[] } | null>(null)
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      setLoading(true)
      try {
        const societies = await fetchSocieties()
        const results = await Promise.allSettled(societies.map((society) => fetchSocietyContext(society.society_id, 'interaction')))
        if (cancelled) return
        const next: Conversation[] = []
        results.forEach((result, societyIndex) => {
          if (result.status !== 'fulfilled') return
          result.value.events.forEach((event, eventIndex) => {
            const conversation = toConversation(event, societies[societyIndex].name, eventIndex)
            if (conversation) next.push(conversation)
          })
        })
        next.sort((a, b) => b.timestamp - a.timestamp)
        setConversations(next.slice(0, 500))
        setError('')
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 4000)
    return () => { cancelled = true; window.clearInterval(timer) }
    // refreshSeq: an immediate refetch on a real tick/prompt trigger,
    // on top of the existing 4s poll for changes with no explicit one.
  }, [refreshSeq])

  const threads = useMemo(() => [...new Set(conversations.map((conversation) => conversation.thread))], [conversations])
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return conversations.filter((conversation) => {
      if (thread !== 'all' && conversation.thread !== thread) return false
      if (!query) return true
      return [conversation.sender, conversation.recipient, conversation.thread, conversation.detail]
        .join(' ').toLowerCase().includes(query)
    })
  }, [conversations, search, thread])

  const selectConversation = (conversation: Conversation) => {
    setSelectedId(conversation.id)
    highlightActors(conversation.actorIds)
  }

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedConversation) {
      setAnimation(null)
      return
    }
    const startedAt = Date.now() / 1000
    const typing: ConversationMessage = {
      id: `${selectedConversation.id}:typing`, sender: selectedConversation.recipient,
      recipient: selectedConversation.sender, text: 'Typing…', timestamp: startedAt, state: 'typing',
    }
    const reply: ConversationMessage = {
      id: `${selectedConversation.id}:reply`, sender: selectedConversation.recipient,
      recipient: selectedConversation.sender, text: selectedConversation.detail || 'Reply sent.', timestamp: startedAt, state: 'reply',
    }
    const completed: ConversationMessage = {
      id: `${selectedConversation.id}:complete`, sender: selectedConversation.recipient,
      recipient: selectedConversation.sender, text: 'Delivered', timestamp: startedAt, state: 'complete',
    }
    setAnimation({ conversation: selectedConversation, phase: 'typing', messages: [typing] })
    const replyTimer = window.setTimeout(() => setAnimation({ conversation: selectedConversation, phase: 'reply', messages: [typing, reply] }), 900)
    const completeTimer = window.setTimeout(() => setAnimation({ conversation: selectedConversation, phase: 'complete', messages: [typing, reply, completed] }), 1900)
    return () => { window.clearTimeout(replyTimer); window.clearTimeout(completeTimer) }
  }, [selectedId, selectedConversation])

  return <div className="lwe-inspector">
    <div className="lwe-inspector-tier">Conversations</div>
    <div className="lwe-conversation-timeline">
      <div className="lwe-conversation-controls">
        <input aria-label="Search conversations" placeholder="Search conversations..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Filter by thread" value={thread} onChange={(event) => setThread(event.target.value)}>
          <option value="all">All threads</option>
          {threads.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      {error && <div className="lwe-conversation-error">{error}</div>}
      {animation && <div className="lwe-conversation-animation" aria-live="polite">
        <div className="lwe-conversation-animation-route"><span>{animation.conversation.sender}</span><span className="lwe-conversation-animation-arrow">↓</span><span>{animation.conversation.recipient}</span></div>
        <div className="lwe-conversation-bubbles">
          <div className="lwe-conversation-bubble lwe-conversation-bubble-sender">{animation.conversation.detail || 'Message sent.'}</div>
          <div className={`lwe-conversation-bubble lwe-conversation-bubble-recipient lwe-conversation-bubble-${animation.phase}`}>
            {animation.phase === 'typing' ? 'Typing…' : animation.phase === 'reply' ? 'Replying…' : 'Reply complete ✓'}
          </div>
        </div>
      </div>}
      <div className="lwe-conversation-list">
        {visible.length === 0 && <div className="lwe-conversation-empty">{loading ? 'Loading conversations…' : 'No conversations match.'}</div>}
        {visible.map((conversation) => <button
          type="button" key={conversation.id}
          className={`lwe-conversation-row${selectedId === conversation.id ? ' lwe-conversation-row-selected' : ''}`}
          onClick={() => selectConversation(conversation)}
        >
          <time>{new Date(conversation.timestamp * 1000).toLocaleString()}</time>
          <span className="lwe-conversation-sender">{conversation.sender}</span>
          <span className="lwe-conversation-arrow">→</span>
          <span className="lwe-conversation-recipient">{conversation.recipient}</span>
          <span className="lwe-conversation-thread">{conversation.thread}</span>
          <span className="lwe-conversation-detail">{conversation.detail}</span>
        </button>)}
        {animation?.messages.map((message) => <div className="lwe-conversation-message-row" key={message.id}>
          <time>{new Date(message.timestamp * 1000).toLocaleTimeString()}</time>
          <span className="lwe-conversation-message-label">{message.state}</span>
          <strong>{message.sender}</strong><span className="lwe-conversation-arrow">→</span><strong>{message.recipient}</strong>
          <span className="lwe-conversation-message-text">{message.text}</span>
        </div>)}
      </div>
      {selectedId && <div className="lwe-conversation-hint">Selected conversation highlights participating actors.</div>}
    </div>
  </div>
}
