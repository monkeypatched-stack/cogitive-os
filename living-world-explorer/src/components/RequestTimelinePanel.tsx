import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAllActors, fetchActorTimeline, fetchSocieties, type Actor, type ActorTimelineEntry, type Society } from '../api/actorClient'
import { fetchGeoEntities, type GeoEntity } from '../api/geoClient'
import { fetchExecutionPlanningContext, type ContextSnapshotDto } from '../api/contextClient'
import { fetchProducts, fetchMerchants, type Product, type Merchant } from '../api/commerceClient'
import { useWorldStore } from '../store/worldStore'
import { readable, formatTime } from './inspectorPrimitives'
import {
  classify, describe, executionIdOf, worldChangesOf, CATEGORY_COLOR, CATEGORY_LABEL,
  type Category, type EventView, type ResolveCtx,
} from '../timeline/timelineEvents'
import './RequestTimelinePanel.css'

// ─── Causal execution timeline ─────────────────────────────────────────────
// A causal/temporal trace, not a table of database rows. Real data only —
// every node comes from GET /actors/{id}/timeline (10 real TimelineKinds,
// kernel/timeline/entry.py) plus, for the WORLD->OBSERVE->BELIEVE->GROUND
// portion no timeline record covers, the same real per-execution
// ContextSnapshotDto GroundingGraphPanel reads. Nothing here is seeded,
// simulated, or invented for visual completeness — an execution with no
// recorded grounding snapshot says so, not a fabricated placeholder.

type ZoomLevel = 'overview' | 'execution' | 'trace'
const ALL_CATEGORIES: Category[] = ['world', 'observation', 'belief', 'grounding', 'cognition', 'action', 'learning']

interface Moment {
  key: string
  time: number
  kind: 'group' | 'standalone'
  executionId: string
  entries: ActorTimelineEntry[] // group: [intent?, belief*, plan?, decision*, execution]; standalone: [entry]
}

function groupMoments(entries: ActorTimelineEntry[]): Moment[] {
  const byExec = new Map<string, ActorTimelineEntry[]>()
  const standalone: ActorTimelineEntry[] = []
  for (const entry of entries) {
    const execId = executionIdOf(entry)
    const kind = classify(entry)
    if (execId && kind !== 'presence' && kind !== 'membership' && kind !== 'relationship' && kind !== 'activity' && kind !== 'goal') {
      const arr = byExec.get(execId) ?? []
      arr.push(entry)
      byExec.set(execId, arr)
    } else {
      standalone.push(entry)
    }
  }
  const moments: Moment[] = []
  for (const entry of standalone) {
    moments.push({ key: (entry.entry_id as string) ?? `${entry.start_time}`, time: (entry.start_time as number) ?? 0, kind: 'standalone', executionId: '', entries: [entry] })
  }
  for (const [execId, group] of byExec) {
    const order: Record<string, number> = { intent: 0, belief: 1, plan: 2, decision: 3, execution: 4 }
    group.sort((a, b) => order[classify(a)] - order[classify(b)])
    const time = Math.min(...group.map((e) => (e.start_time as number) ?? 0))
    moments.push({ key: `exec:${execId}`, time, kind: 'group', executionId: execId, entries: group })
  }
  return moments.sort((a, b) => a.time - b.time)
}

function statusOf(entries: ActorTimelineEntry[]): 'success' | 'failure' | 'partial' | undefined {
  const exec = entries.find((e) => classify(e) === 'execution')
  return exec?.outcome as 'success' | 'failure' | 'partial' | undefined
}

// ─── Category dot + connector ──────────────────────────────────────────────
function Dot({ category }: { category: Category }) {
  return <span className="lwe-tl-dot" style={{ background: CATEGORY_COLOR[category] }} title={CATEGORY_LABEL[category]} />
}

function CausalArrow({ causal }: { causal: boolean }) {
  return <div className={`lwe-tl-arrow${causal ? ' is-causal' : ''}`}><span /></div>
}

// ─── Event node (used both standalone and inside an execution chain) ──────
function EventNode({ view, entry, onClick, selected, isNew }: {
  view: EventView; entry: ActorTimelineEntry; onClick: () => void; selected: boolean; isNew: boolean
}) {
  return (
    <button type="button" className={`lwe-tl-node${selected ? ' is-selected' : ''}${isNew ? ' is-new' : ''}`} onClick={onClick}>
      <div className="lwe-tl-node-top">
        <Dot category={view.category} />
        <span className="lwe-tl-node-type">{view.eventType}</span>
        <span className="lwe-tl-node-time">{formatTime(entry.start_time as number)}</span>
      </div>
      <div className="lwe-tl-node-title">{view.title}</div>
      <div className="lwe-tl-node-meta">
        {view.status && <span className={`lwe-tl-status lwe-tl-status-${view.status}`}>{view.status}</span>}
        {view.durationMs != null && <span className="lwe-tl-duration">{view.durationMs.toFixed(0)}ms</span>}
      </div>
    </button>
  )
}

// ─── Snapshot-derived sub-stages (Knowledge / Grounding / Prompt) ──────────
// Real evidence_ids[0] is the KG entity_id (context_engine.py's own
// `evidence_ids=(entity.entity_id,)`) — cross-referenced against the real
// Product/Merchant catalog so "Large Eggs (Dozen)" at two different stores
// reads as two distinct facts (store + price), never merged by name.
function knowledgeLine(k: { content: string; evidence_ids: string[] }, productById: Map<string, Product>, storeNameById: Map<string, string>): string {
  const product = k.evidence_ids[0] ? productById.get(k.evidence_ids[0]) : undefined
  if (!product) return readable(k.content)
  const store = storeNameById.get(product.store_id) ?? product.store_id
  return `${product.name} — ${store} — $${product.price.toFixed(2)}`
}

function SnapshotStages({ snapshot, productById, storeNameById }: { snapshot: ContextSnapshotDto; productById: Map<string, Product>; storeNameById: Map<string, string> }) {
  return <>
    <CausalArrow causal />
    <div className="lwe-tl-node lwe-tl-node-synthetic">
      <div className="lwe-tl-node-top"><Dot category="grounding" /><span className="lwe-tl-node-type">Knowledge Retrieval</span><span className="lwe-tl-source-tag">from grounding snapshot</span></div>
      <div className="lwe-tl-node-title">{snapshot.knowledge.length === 0 ? 'No knowledge retrieved' : `Retrieved ${snapshot.knowledge.length} item${snapshot.knowledge.length === 1 ? '' : 's'}`}</div>
      {snapshot.knowledge.length > 0 && <ul className="lwe-inspector-list">{snapshot.knowledge.slice(0, 6).map((k, i) => <li key={i}>{knowledgeLine(k, productById, storeNameById)}</li>)}</ul>}
    </div>
    <CausalArrow causal />
    <div className="lwe-tl-node lwe-tl-node-synthetic">
      <div className="lwe-tl-node-top"><Dot category="grounding" /><span className="lwe-tl-node-type">Grounding Context Created</span><span className="lwe-tl-source-tag">from grounding snapshot</span></div>
      <div className="lwe-tl-node-title">{snapshot.available_capabilities.length} capabilities · {snapshot.affiliations.length} affiliations · {snapshot.observed_facts.length} observed facts</div>
    </div>
    <CausalArrow causal />
    <div className="lwe-tl-node lwe-tl-node-synthetic">
      <div className="lwe-tl-node-top"><Dot category="cognition" /><span className="lwe-tl-node-type">Prompt Constructed</span><span className="lwe-tl-source-tag">from grounding snapshot</span></div>
      <div className="lwe-tl-node-title">{snapshot.prompt_tokens} tokens</div>
    </div>
  </>
}

// ─── One execution group: World(causal) → Observe → Believe → Ground → Plan → Act → World Change ──
function ExecutionGroup({
  moment, ctx, zoom, snapshot, snapshotStatus, onExpand, selectedKey, onSelect, causalIntoGroup, newKeys, productById, storeNameById, categoryFilter,
}: {
  moment: Moment; ctx: ResolveCtx; zoom: ZoomLevel
  snapshot: ContextSnapshotDto | undefined; snapshotStatus: 'idle' | 'loading' | 'loaded' | 'unavailable'
  onExpand: () => void; selectedKey: string | null; onSelect: (key: string, entry: ActorTimelineEntry, view: EventView) => void
  causalIntoGroup: boolean; newKeys: Set<string>
  productById: Map<string, Product>; storeNameById: Map<string, string>
  categoryFilter: Set<Category>
}) {
  const [collapsed, setCollapsed] = useState(zoom === 'overview')
  useEffect(() => { setCollapsed(zoom === 'overview') }, [zoom])
  const execEntry = moment.entries.find((e) => classify(e) === 'execution')
  const status = statusOf(moment.entries)
  const worldChanges = execEntry ? worldChangesOf(execEntry) : []

  const toggle = () => {
    setCollapsed((c) => !c)
    if (collapsed) onExpand()
  }

  return <div className="lwe-tl-group">
    <div className="lwe-tl-group-connector">{causalIntoGroup && <CausalArrow causal />}</div>
    <button type="button" className="lwe-tl-group-header" onClick={toggle}>
      <span className={`lwe-tl-caret${collapsed ? '' : ' is-open'}`}>▶</span>
      <span className="lwe-tl-group-title">{execEntry ? readable(execEntry.goal) : 'Execution'}</span>
      {status && <span className={`lwe-tl-status lwe-tl-status-${status}`}>{status}</span>}
      <span className="lwe-tl-node-time">{formatTime(moment.time)}</span>
    </button>
    {!collapsed && <div className="lwe-tl-group-body">
      {moment.entries.map((entry, i) => {
        const kind = classify(entry)
        const view = describe(entry, kind, ctx)
        const key = `${moment.key}:${i}`
        if (zoom === 'overview' && kind !== 'execution') return null
        if (!categoryFilter.has(view.category)) return null
        return <div key={key}>
          {i > 0 && <CausalArrow causal />}
          <div onClick={() => onSelect(key, entry, view)}>
            <EventNode view={view} entry={entry} onClick={() => onSelect(key, entry, view)} selected={selectedKey === key} isNew={newKeys.has(key)} />
          </div>
          {kind === 'intent' && zoom !== 'overview' && (
            snapshotStatus === 'loading' ? <><CausalArrow causal /><div className="lwe-tl-node-loading">Loading grounding data…</div></>
              : snapshotStatus === 'unavailable' ? <><CausalArrow causal /><div className="lwe-tl-node-unavailable">No grounding snapshot recorded for this execution — a known backend gap, not hidden data.</div></>
              : snapshot ? <SnapshotStages snapshot={snapshot} productById={productById} storeNameById={storeNameById} /> : null
          )}
        </div>
      })}
      {execEntry && worldChanges.length > 0 && zoom !== 'overview' && <>
        <CausalArrow causal />
        <div className="lwe-tl-node lwe-tl-node-synthetic">
          <div className="lwe-tl-node-top"><Dot category="world" /><span className="lwe-tl-node-type">World Change</span></div>
          <ul className="lwe-inspector-list">{worldChanges.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      </>}
      <CausalArrow causal={false} />
      <div className="lwe-tl-node-unavailable">Learning: not recorded as a distinct timeline event by this backend.</div>
    </div>}
  </div>
}

export function RequestTimelinePanel() {
  const navigate = useNavigate()
  const selectActor = useWorldStore((s) => s.selectActor)

  const [actors, setActors] = useState<Actor[]>([])
  const [spaces, setSpaces] = useState<GeoEntity[]>([])
  const [societies, setSocieties] = useState<Society[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [selectedActorId, setSelectedActorId] = useState('')
  const [entries, setEntries] = useState<ActorTimelineEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [zoom, setZoom] = useState<ZoomLevel>('execution')
  const [categoryFilter, setCategoryFilter] = useState<Set<Category>>(new Set(ALL_CATEGORIES))
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure' | 'partial'>('all')
  const [timeRange, setTimeRange] = useState<'all' | 'hour' | '15min'>('all')

  const [live, setLive] = useState(true)
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set())
  const knownKeysRef = useRef<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const userScrolledRef = useRef(false)

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<ActorTimelineEntry | null>(null)
  const [selectedView, setSelectedView] = useState<EventView | null>(null)

  const [snapshots, setSnapshots] = useState<Record<string, ContextSnapshotDto | 'loading' | 'unavailable'>>({})
  const [compareIds, setCompareIds] = useState<string[]>([])

  // ── Static reference data — once ────────────────────────────────────────
  useEffect(() => {
    Promise.all([fetchAllActors(), fetchGeoEntities(), fetchSocieties(), fetchProducts(), fetchMerchants()])
      .then(([a, g, s, p, m]) => {
        const humans = a.filter((x) => x.actor_type === 'human')
        setActors(a)
        setSpaces(g.filter((e) => e.entity_type === 'space'))
        setSocieties(s)
        setProducts(p)
        setMerchants(m)
        setSelectedActorId((cur) => cur || humans.find((x) => x.name.toLowerCase() === 'priya sharma')?.actor_id || humans[0]?.actor_id || '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  const ctx: ResolveCtx = useMemo(() => ({
    actorsById: new Map(actors.map((a) => [a.actor_id, a])),
    spacesById: new Map(spaces.map((s) => [s.entity_id, s])),
    societiesById: new Map(societies.map((s) => [s.society_id, s])),
  }), [actors, spaces, societies])
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const storeNameById = useMemo(() => new Map(merchants.map((m) => [m.store_id, m.name])), [merchants])

  // ── Load timeline for selected actor; poll while Live ──────────────────
  const load = (silent = false) => {
    if (!selectedActorId) return
    if (!silent) setLoading(true)
    fetchActorTimeline(selectedActorId)
      .then((result) => {
        const fresh = new Set<string>()
        for (const e of result) {
          const id = (e.entry_id as string) ?? String(e.start_time)
          if (!knownKeysRef.current.has(id)) fresh.add(id)
          knownKeysRef.current.add(id)
        }
        if (silent && fresh.size > 0) {
          setNewKeys(fresh)
          setTimeout(() => setNewKeys(new Set()), 2200)
        }
        setEntries(result)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    knownKeysRef.current = new Set()
    setSelectedKey(null); setSelectedEntry(null); setSelectedView(null); setCompareIds([]); setSnapshots({})
    userScrolledRef.current = false
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedActorId])

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => load(true), 15000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, selectedActorId])

  useEffect(() => {
    if (live && !userScrolledRef.current && listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [entries, live])

  // ── Moments ──────────────────────────────────────────────────────────────
  const allMoments = useMemo(() => groupMoments(entries), [entries])
  const rangeCutoff = useMemo(() => {
    if (timeRange === 'all' || allMoments.length === 0) return 0
    const latest = allMoments[allMoments.length - 1].time
    return latest - (timeRange === 'hour' ? 3600 : 900)
  }, [timeRange, allMoments])
  const moments = useMemo(() => {
    return allMoments.filter((m) => {
      if (m.time < rangeCutoff) return false
      const status = statusOf(m.entries)
      if (statusFilter !== 'all' && m.kind === 'group' && status !== statusFilter) return false
      const cats = new Set(m.entries.map((e) => describe(e, classify(e), ctx).category))
      return [...cats].some((c) => categoryFilter.has(c))
    })
  }, [allMoments, rangeCutoff, statusFilter, categoryFilter, ctx])

  const loadSnapshot = (executionId: string) => {
    if (!selectedActorId || !executionId || snapshots[executionId]) return
    setSnapshots((prev) => ({ ...prev, [executionId]: 'loading' }))
    fetchExecutionPlanningContext(selectedActorId, executionId)
      .then((snap) => setSnapshots((prev) => ({ ...prev, [executionId]: snap })))
      .catch(() => setSnapshots((prev) => ({ ...prev, [executionId]: 'unavailable' })))
  }

  // Verified causal link: a standalone Presence event feeds this execution
  // group's Observation stage only if the execution's OWN grounding
  // snapshot recorded that exact Presence entry_id as its world_state
  // location — not just "happened before," a real matched reference.
  const causalPresenceInto = (execMoment: Moment): boolean => {
    const snap = snapshots[execMoment.executionId]
    if (!snap || snap === 'loading' || snap === 'unavailable') return false
    const loc = snap.world_state?.location as { entry_id?: string } | undefined
    if (!loc?.entry_id) return false
    const idx = moments.findIndex((m) => m.key === execMoment.key)
    for (let i = idx - 1; i >= 0; i--) {
      const prev = moments[i]
      if (prev.kind !== 'standalone') continue
      const e = prev.entries[0]
      if (classify(e) === 'presence' && e.entry_id === loc.entry_id) return true
      if (prev.time < execMoment.time - 3600) break
    }
    return false
  }

  const toggleCompare = (executionId: string) => {
    loadSnapshot(executionId)
    setCompareIds((cur) => {
      if (cur.includes(executionId)) return cur.filter((id) => id !== executionId)
      if (cur.length >= 2) return [cur[1], executionId]
      return [...cur, executionId]
    })
  }

  const select = (key: string, entry: ActorTimelineEntry, view: EventView) => {
    setSelectedKey((cur) => (cur === key ? null : key))
    setSelectedEntry(entry); setSelectedView(view)
  }

  const jumpToLatest = () => {
    userScrolledRef.current = false
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }

  const openWorldMap = () => { if (selectedActorId) { selectActor(selectedActorId); navigate('/world-map') } }
  const openGroundingGraph = () => { if (selectedActorId) { selectActor(selectedActorId); navigate('/grounding-graph') } }
  const openExecutionGraph = () => navigate('/execution-debugger/plan')
  const openNegotiation = () => { if (selectedActorId) { selectActor(selectedActorId); navigate('/negotiations') } }

  const humanActors = actors.filter((a) => a.actor_type === 'human')
  const compareReady = compareIds.length === 2 && compareIds.every((id) => snapshots[id] && snapshots[id] !== 'loading' && snapshots[id] !== 'unavailable')
  const [cmpA, cmpB] = compareReady ? compareIds.map((id) => snapshots[id] as ContextSnapshotDto) : [null, null]

  return <div className="lwe-tl-page">
    <div className="lwe-tl-heading">
      <div>
        <h2>Timeline</h2>
        <p>Causal execution trace — World → Observe → Believe → Ground → Plan → Act, in real recorded order. Real records only, nothing fabricated.</p>
      </div>
      <select aria-label="Actor" className="lwe-affiliation-actor-select" value={selectedActorId} onChange={(e) => setSelectedActorId(e.target.value)}>
        {humanActors.map((a) => <option key={a.actor_id} value={a.actor_id}>{a.name}</option>)}
      </select>
    </div>

    <div className="lwe-tl-toolbar">
      <div className="lwe-tl-toolbar-group">
        {(['overview', 'execution', 'trace'] as ZoomLevel[]).map((z) => (
          <button key={z} type="button" className={`lwe-tl-zoom-btn${zoom === z ? ' is-active' : ''}`} onClick={() => setZoom(z)}>{z}</button>
        ))}
      </div>
      <div className="lwe-tl-toolbar-group">
        {ALL_CATEGORIES.map((c) => (
          <button key={c} type="button" className={`lwe-tl-cat-chip${categoryFilter.has(c) ? ' is-on' : ''}`}
            style={{ '--chip-color': CATEGORY_COLOR[c] } as React.CSSProperties}
            onClick={() => setCategoryFilter((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })}>
            <Dot category={c} />{CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="lwe-tl-toolbar-group">
        <select aria-label="Status filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">All statuses</option>
          <option value="success">Success</option>
          <option value="partial">Partial</option>
          <option value="failure">Failure</option>
        </select>
        <select aria-label="Time range" value={timeRange} onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}>
          <option value="all">All time</option>
          <option value="hour">Last hour</option>
          <option value="15min">Last 15 min</option>
        </select>
      </div>
      <div className="lwe-tl-toolbar-group">
        <button type="button" className={`lwe-tl-live-btn${live ? ' is-live' : ''}`} onClick={() => setLive((v) => !v)}>{live ? '● Live' : 'Paused'}</button>
        <button type="button" onClick={jumpToLatest}>Jump to Latest</button>
      </div>
    </div>

    {error && <div className="lwe-gg-error">⚠ {error}</div>}

    {compareIds.length === 2 && (
      <section className="lwe-rt-compare">
        <div className="lwe-rt-compare-heading">Before / After comparison</div>
        {!compareReady ? <div className="lwe-inspector-muted">Loading both executions…</div> : (() => {
          const rows: Array<[string, string, string]> = [
            ['Location', String((cmpA!.world_state?.location as { space_id?: string })?.space_id ?? 'unknown'), String((cmpB!.world_state?.location as { space_id?: string })?.space_id ?? 'unknown')],
            ['Knowledge items', String(cmpA!.knowledge.length), String(cmpB!.knowledge.length)],
            ['Grounding items', String(cmpA!.available_capabilities.length + cmpA!.affiliations.length), String(cmpB!.available_capabilities.length + cmpB!.affiliations.length)],
            ['Prompt tokens', String(cmpA!.prompt_tokens), String(cmpB!.prompt_tokens)],
          ]
          const knowledgeChanged = cmpA!.knowledge.map((k) => k.content).sort().join('|') !== cmpB!.knowledge.map((k) => k.content).sort().join('|')
          return <>
            <table className="lwe-rt-compare-table"><tbody>
              {rows.map(([label, a, b]) => {
                const spaceA = ctx.spacesById.get(a)?.name ?? a
                const spaceB = ctx.spacesById.get(b)?.name ?? b
                const va = label === 'Location' ? spaceA : a
                const vb = label === 'Location' ? spaceB : b
                const changed = va !== vb
                return <tr key={label} className={changed ? 'is-different' : ''}>
                  <td>{label}</td><td>{va}</td><td>{vb}</td>
                </tr>
              })}
            </tbody></table>
            <div className="lwe-rt-compare-verdict">
              <strong>Retrieved knowledge: {knowledgeChanged ? 'DIFFERENT' : 'IDENTICAL'}</strong>
              {!knowledgeChanged && <span className="lwe-inspector-hint-inline"> — same {cmpA!.knowledge.length} items regardless of what else changed.</span>}
            </div>
          </>
        })()}
        <button type="button" onClick={() => setCompareIds([])}>Clear comparison</button>
      </section>
    )}

    <div className="lwe-tl-body">
      <div className="lwe-tl-list" ref={listRef} onScroll={() => { userScrolledRef.current = true }}>
        {loading && <div className="lwe-inspector-muted">Loading…</div>}
        {!loading && moments.length === 0 && <div className="lwe-inspector-muted">No timeline events recorded for this actor yet.</div>}
        {moments.map((m, i) => {
          if (m.kind === 'standalone') {
            const entry = m.entries[0]
            const kind = classify(entry)
            const view = describe(entry, kind, ctx)
            const key = m.key
            return <div key={key}>
              {i > 0 && <CausalArrow causal={false} />}
              <EventNode view={view} entry={entry} onClick={() => select(key, entry, view)} selected={selectedKey === key} isNew={newKeys.has(key)} />
            </div>
          }
          return <div key={m.key} className="lwe-tl-group-row">
            <ExecutionGroup
              moment={m} ctx={ctx} zoom={zoom}
              snapshot={typeof snapshots[m.executionId] === 'object' ? snapshots[m.executionId] as ContextSnapshotDto : undefined}
              snapshotStatus={snapshots[m.executionId] === 'loading' ? 'loading' : snapshots[m.executionId] === 'unavailable' ? 'unavailable' : snapshots[m.executionId] ? 'loaded' : 'idle'}
              onExpand={() => loadSnapshot(m.executionId)}
              selectedKey={selectedKey} onSelect={select}
              causalIntoGroup={causalPresenceInto(m)}
              newKeys={newKeys}
              productById={productById} storeNameById={storeNameById}
              categoryFilter={categoryFilter}
            />
            <label className="lwe-tl-compare-toggle">
              <input type="checkbox" checked={compareIds.includes(m.executionId)} onChange={() => toggleCompare(m.executionId)} /> Compare
            </label>
          </div>
        })}
      </div>

      {selectedEntry && selectedView && (
        <aside className="lwe-tl-inspector">
          <div className="lwe-tl-inspector-header">
            <span className="lwe-tl-inspector-badge" style={{ background: CATEGORY_COLOR[selectedView.category] + '22', color: CATEGORY_COLOR[selectedView.category] }}>{CATEGORY_LABEL[selectedView.category]}</span>
            <button type="button" onClick={() => setSelectedKey(null)} aria-label="Close inspector">✕</button>
          </div>
          <h3>{selectedView.eventType}</h3>
          <p className="lwe-tl-inspector-title">{selectedView.title}</p>
          <dl className="lwe-inspector-fields">
            <div><dt>Timestamp</dt><dd>{formatTime(selectedEntry.start_time as number)}</dd></div>
            <div><dt>Actor</dt><dd>{ctx.actorsById.get(selectedEntry.actor_id as string)?.name ?? String(selectedEntry.actor_id)}</dd></div>
            {executionIdOf(selectedEntry) && <div><dt>Execution ID</dt><dd className="lwe-gg-mono">{executionIdOf(selectedEntry)}</dd></div>}
            {selectedView.status && <div><dt>Status</dt><dd>{selectedView.status}</dd></div>}
            {selectedView.durationMs != null && <div><dt>Duration</dt><dd>{selectedView.durationMs.toFixed(0)}ms</dd></div>}
          </dl>
          <div className="lwe-tl-inspector-links">
            {selectedView.category === 'world' && <button type="button" onClick={openWorldMap}>Open World Map →</button>}
            {selectedView.category === 'grounding' && executionIdOf(selectedEntry) && <button type="button" onClick={openGroundingGraph}>Open Grounding Graph →</button>}
            {selectedView.category === 'cognition' && <button type="button" onClick={openExecutionGraph}>Open Execution Graph →</button>}
            {selectedView.negotiationExecutionId && <button type="button" onClick={openNegotiation}>View in Negotiations →</button>}
          </div>
          <details className="lwe-tl-raw">
            <summary>Raw Data</summary>
            <pre className="lwe-gg-pre">{JSON.stringify(selectedEntry, null, 2)}</pre>
          </details>
        </aside>
      )}
    </div>
  </div>
}
