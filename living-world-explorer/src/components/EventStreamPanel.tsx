import { useEffect, useMemo, useState } from 'react'
import { PanelContainer } from './PanelContainer'
import { useRefreshStore } from '../store/refreshStore'
import {
  fetchActorTimeline, fetchActors, fetchSocieties, fetchSocietyContext,
  type ActorTimelineEntry, type SocietyContextEvent,
} from '../api/actorClient'
import './EventStreamPanel.css'

type EventCategory = 'context' | 'planetary' | 'execution'
type Filter = 'all' | EventCategory

interface StreamEvent {
  id: string
  category: EventCategory
  timestamp: number
  title: string
  detail: string
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${key}: ${typeof item === 'object' ? '[details]' : String(item)}`)
    .join(' · ')
}

function contextEvent(event: SocietyContextEvent, societyName: string, index: number): StreamEvent {
  const eventType = String(event.event_type || '').toLowerCase()
  const planetary = eventType === 'world_update' || eventType === 'planetary' || eventType === 'planetary_event' || eventType.includes('world') || eventType.includes('planet')
  return {
    id: `${planetary ? 'planetary' : 'context'}:${societyName}:${event.event_id || `${event.timestamp || index}`}`,
    category: planetary ? 'planetary' : 'context',
    timestamp: event.timestamp || Date.now() / 1000,
    title: event.description || event.event_type || 'Context event',
    detail: [societyName, event.actor_id, valueText(event.payload)].filter(Boolean).join(' · '),
  }
}

function executionEvent(entry: ActorTimelineEntry, actorName: string, index: number): StreamEvent {
  const plan = Array.isArray(entry.plan_summary) ? entry.plan_summary.join(' → ') : ''
  return {
    id: String(entry.entry_id || `execution-${actorName}-${entry.start_time || index}`),
    category: 'execution',
    timestamp: entry.start_time || Date.now() / 1000,
    title: valueText(entry.outcome) || valueText(entry.goal) || 'Execution event',
    detail: [actorName, plan, valueText(entry.failure_reason)].filter(Boolean).join(' · '),
  }
}

export function EventStreamPanel() {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [error, setError] = useState('')
  const refreshSeq = useRefreshStore((s) => s.refreshSeq)

  useEffect(() => {
    if (paused) return
    let cancelled = false

    const refresh = async () => {
      setLoading(true)
      try {
        const [societies, actors] = await Promise.all([fetchSocieties(), fetchActors()])
        const contextResults = await Promise.allSettled(
          societies.map((society) => fetchSocietyContext(society.society_id)),
        )
        const timelineResults = await Promise.allSettled(
          actors.map((actor) => fetchActorTimeline(actor.actor_id)),
        )
        if (cancelled) return
        const next: StreamEvent[] = []
        contextResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            result.value.events.forEach((event, eventIndex) => {
              next.push(contextEvent(event, societies[index].name, eventIndex))
            })
          }
        })
        timelineResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            result.value.filter((entry) => entry.plan_summary || entry.outcome || entry.goal)
              .forEach((entry, entryIndex) => next.push(executionEvent(entry, actors[index].name, entryIndex)))
          }
        })
        next.sort((a, b) => b.timestamp - a.timestamp)
        setEvents(next.slice(0, 1000))
        setLastUpdated(Date.now())
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
  }, [paused, refreshSeq])

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase()
    return events.filter((event) => {
      const categoryMatches = filter === 'all' || event.category.toLowerCase() === filter.toLowerCase()
      if (!categoryMatches) return false
      if (!query) return true
      return `${event.title} ${event.detail}`.toLowerCase().includes(query)
    })
  }, [events, filter, search])

  const counts = useMemo(() => ({
    all: events.length,
    context: events.filter((event) => event.category === 'context').length,
    planetary: events.filter((event) => event.category === 'planetary').length,
    execution: events.filter((event) => event.category === 'execution').length,
  }), [events])

  return <PanelContainer title="Event Stream">
    <div className="lwe-event-stream">
      <div className="lwe-event-stream-controls">
        <div className="lwe-event-stream-filters" role="group" aria-label="Event filters">
          {(['all', 'context', 'planetary', 'execution'] as Filter[]).map((item) => <button
            key={item} type="button" aria-pressed={filter === item} data-filter={item}
            className={filter === item ? 'lwe-event-filter-active' : ''}
            onClick={() => setFilter(item)}
          >{item === 'all' ? 'All' : item[0].toUpperCase() + item.slice(1)} <span className="lwe-event-filter-count">{counts[item]}</span></button>)}
        </div>
        <select aria-label="Filter event category" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
          <option value="all">All event types</option>
          <option value="context">Context Events ({counts.context})</option>
          <option value="planetary">Planetary Events ({counts.planetary})</option>
          <option value="execution">Execution Events ({counts.execution})</option>
        </select>
        <input aria-label="Search events" placeholder="Search events..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="button" className="lwe-event-pause" onClick={() => setPaused((value) => !value)}>{paused ? 'Resume' : 'Pause'}</button>
      </div>
      <div className="lwe-event-stream-status">
        <span className={paused ? 'lwe-event-status-paused' : 'lwe-event-status-live'}>{paused ? 'Paused' : 'Live'}</span>
        <span>{loading ? 'Updating…' : `${visibleEvents.length} events`}</span>
        {lastUpdated && <span>Updated {new Date(lastUpdated).toLocaleTimeString()}</span>}
        {error && <span className="lwe-event-stream-error">{error}</span>}
      </div>
      <div className="lwe-event-stream-list">
        {visibleEvents.length === 0 && <div className="lwe-event-stream-empty">{loading ? 'Loading events…' : 'No events match.'}</div>}
        {visibleEvents.map((event) => <article className="lwe-event-row" key={`${event.category}:${event.id}`}>
          <time>{new Date(event.timestamp * 1000).toLocaleTimeString()}</time>
          <span className={`lwe-event-badge lwe-event-badge-${event.category}`}>{event.category}</span>
          <div><div className="lwe-event-title">{event.title}</div>{event.detail && <div className="lwe-event-detail">{event.detail}</div>}</div>
        </article>)}
      </div>
    </div>
  </PanelContainer>
}
