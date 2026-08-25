import { useEffect, useMemo, useState } from 'react'
import { fetchAgents, fetchCapabilities, type AgentCard, type CapabilityCard } from '../api/capabilityClient'
import { fetchAllActors, type Actor } from '../api/actorClient'
import { fetchActorCognitiveState, type ExecutionHistoryEntry } from '../api/cognitiveClient'
import { fetchExecutionPlanningContext, type ContextSnapshotDto } from '../api/contextClient'
import { readable, formatTime } from './inspectorPrimitives'
import './CapabilityAgentGraphPanel.css'

// ─── Capabilities & Agents — the executable capability topology ───────────
// Two REAL, distinct backend registries, read as-is:
//   GET /agents        — Broca AgentRegistry (295 ETASS/DDD/SDLC agents)
//   GET /capabilities  — Wolverine Runtime._capabilities (69 real
//                         capabilities: Cerebellum providers like
//                         anthropic/nanda/openclaw/n8n/github, plus
//                         domain-vertical capabilities)
// `/capabilities/bus/graph`, `/capabilities/bus/search`, and
// `/agents/bus/resolve` — the routes that would have supplied real
// Agent<->Capability edges and a distinct Provider/Resource layer — call
// methods (`list_capabilities`, `agent_bus.resolve_agent`, `view_graph`)
// that do not exist on any CapabilityBus implementation in this codebase
// (verified live: all three return "CapabilityBus not available"). No
// Agent<->Capability edge, Provider node, or Resource node is fabricated
// to compensate — this view honestly shows two separate real registries,
// says so, and does not invent a relationship the backend cannot back.
//
// The one REAL runtime signal available is per-execution:
// ExecutionRecord.capabilities_used / ContextSnapshotDto.
// available_capabilities — but those name a THIRD, separate capability
// bus (the grocery-domain CommerceCapabilityBus: ProductSelection,
// OrderCreation, ...), not the 69 Wolverine ones above. Execution View
// shows that real, separate bus, and honestly cross-checks whether any
// name overlaps the Wolverine registry rather than assuming they're the
// same namespace.

type Mode = 'topology' | 'agent' | 'capability' | 'execution'

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`lwe-cap-status-dot${ok ? '' : ' is-off'}`} />
}

function EmptyStatePanel({ title, detail }: { title: string; detail: React.ReactNode }) {
  return <div className="lwe-cap-empty-panel">
    <p className="lwe-cap-empty-panel-title">{title}</p>
    <p className="lwe-cap-empty-panel-detail">{detail}</p>
  </div>
}

function RawDataBlock({ data }: { data: unknown }) {
  return <details className="lwe-cap-raw">
    <summary>Raw Data</summary>
    <pre className="lwe-gg-pre">{JSON.stringify(data, null, 2)}</pre>
  </details>
}

export function CapabilityAgentGraphPanel() {
  const [mode, setMode] = useState<Mode>('topology')
  const [agents, setAgents] = useState<AgentCard[]>([])
  const [capabilities, setCapabilities] = useState<CapabilityCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'unavailable'>('all')

  const [selectedAgent, setSelectedAgent] = useState<AgentCard | null>(null)
  const [selectedCapability, setSelectedCapability] = useState<CapabilityCard | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchAgents(), fetchCapabilities()])
      .then(([a, c]) => { setAgents(a.agents); setCapabilities(c.capabilities); setError('') })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return agents.filter((a) => !q || a.agent_type.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
  }, [agents, search])

  const filteredCapabilities = useMemo(() => {
    const q = search.trim().toLowerCase()
    return capabilities.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.type.toLowerCase().includes(q)) return false
      if (statusFilter === 'available' && !c.available) return false
      if (statusFilter === 'unavailable' && c.available) return false
      return true
    })
  }, [capabilities, search, statusFilter])

  return <div className="lwe-cap-page">
    <div className="lwe-cap-heading">
      <div>
        <h2>Capabilities &amp; Agents</h2>
        <p>What MonkeyBrain can do, and which agents exist — the real Agent Registry and Capability Registry, exactly as registered. Not the Knowledge Graph, Grounding Graph, or Society Graph.</p>
      </div>
    </div>

    <div className="lwe-cap-toolbar">
      <div className="lwe-cap-toolbar-group">
        {(['topology', 'agent', 'capability', 'execution'] as Mode[]).map((m) => (
          <button key={m} type="button" className={`lwe-cap-mode-btn${mode === m ? ' is-active' : ''}`} onClick={() => setMode(m)}>
            {m === 'topology' ? 'Topology' : m === 'agent' ? 'Agent View' : m === 'capability' ? 'Capability View' : 'Execution View'}
          </button>
        ))}
      </div>
      {mode !== 'execution' && (
        <div className="lwe-cap-toolbar-controls">
          <input aria-label="Search" className="lwe-cap-search" placeholder="Find agent, capability..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {mode !== 'agent' && (
            <select aria-label="Status filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
          )}
        </div>
      )}
    </div>

    {error && <div className="lwe-gg-error">⚠ {error}</div>}
    {loading && <div className="lwe-inspector-muted">Loading registries…</div>}

    {!loading && mode === 'topology' && (
      <TopologyView
        agents={filteredAgents} capabilities={filteredCapabilities}
        totalAgents={agents.length} totalCapabilities={capabilities.length}
        onSelectAgent={(a) => { setSelectedAgent(a); setMode('agent') }}
        onSelectCapability={(c) => { setSelectedCapability(c); setMode('capability') }}
      />
    )}
    {!loading && mode === 'agent' && (
      <AgentView agents={filteredAgents} selected={selectedAgent} onSelect={setSelectedAgent} capabilities={capabilities} />
    )}
    {!loading && mode === 'capability' && (
      <CapabilityView capabilities={filteredCapabilities} selected={selectedCapability} onSelect={setSelectedCapability} />
    )}
    {!loading && mode === 'execution' && <ExecutionView capabilities={capabilities} />}
  </div>
}

// ─── Topology: two real registries, hierarchical, no fabricated edges ─────
function TopologyView({
  agents, capabilities, totalAgents, totalCapabilities, onSelectAgent, onSelectCapability,
}: {
  agents: AgentCard[]; capabilities: CapabilityCard[]; totalAgents: number; totalCapabilities: number
  onSelectAgent: (a: AgentCard) => void; onSelectCapability: (c: CapabilityCard) => void
}) {
  return <div className="lwe-cap-topology">
    <section className="lwe-cap-tier">
      <div className="lwe-cap-tier-heading">
        <span className="lwe-cap-tier-badge lwe-cap-tier-badge-agent">AGENTS</span>
        <span className="lwe-cap-tier-count">{agents.length}/{totalAgents}</span>
      </div>
      <div className="lwe-cap-grid">
        {agents.map((a) => (
          <button key={a.agent_type} type="button" className="lwe-cap-card lwe-cap-card-agent" onClick={() => onSelectAgent(a)}>
            <div className="lwe-cap-card-name">{a.agent_type}</div>
            <div className="lwe-cap-card-desc">{truncateText(a.description, 90)}</div>
          </button>
        ))}
      </div>
    </section>

    <div className="lwe-cap-tier-connector">
      <span>No live registry in this backend links specific agents to specific capabilities — shown as two separate real registries, not a fabricated edge.</span>
    </div>

    <section className="lwe-cap-tier">
      <div className="lwe-cap-tier-heading">
        <span className="lwe-cap-tier-badge lwe-cap-tier-badge-capability">CAPABILITIES</span>
        <span className="lwe-cap-tier-count">{capabilities.length}/{totalCapabilities}</span>
      </div>
      <div className="lwe-cap-grid">
        {capabilities.map((c) => (
          <button key={c.name} type="button" className="lwe-cap-card lwe-cap-card-capability" onClick={() => onSelectCapability(c)}>
            <div className="lwe-cap-card-name"><StatusDot ok={c.available} />{c.name}</div>
            <div className="lwe-cap-card-desc">implemented by <span className="lwe-gg-mono">{c.type}</span></div>
          </button>
        ))}
      </div>
    </section>
  </div>
}

function truncateText(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// ─── Agent View ─────────────────────────────────────────────────────────
function AgentView({ agents, selected, onSelect, capabilities }: {
  agents: AgentCard[]; selected: AgentCard | null; onSelect: (a: AgentCard) => void; capabilities: CapabilityCard[]
}) {
  return <div className="lwe-cap-split">
    <div className="lwe-cap-list">
      <div className="lwe-cap-list-header"><span>Agents</span><span>{agents.length}</span></div>
      <div className="lwe-cap-list-rows">
        {agents.map((a) => (
          <button key={a.agent_type} type="button" className={`lwe-cap-list-row${selected?.agent_type === a.agent_type ? ' is-selected' : ''}`} onClick={() => onSelect(a)}>
            <span className="lwe-cap-list-row-label">{a.agent_type}</span>
          </button>
        ))}
        {agents.length === 0 && <div className="lwe-cap-list-empty">No agents match.</div>}
      </div>
    </div>
    <div className="lwe-cap-detail">
      {!selected && <div className="lwe-cap-detail-empty">Select an agent to inspect it.</div>}
      {selected && <div className="lwe-cap-detail-inner">
        <div className="lwe-cap-detail-header">
          <h3>{selected.agent_type}</h3>
          <span className="lwe-cap-detail-source">{selected.source === 'local' ? 'Local (Broca registry)' : 'NANDA (remote)'}</span>
        </div>

        <section className="lwe-cap-detail-section">
          <h4>Description</h4>
          <p className="lwe-cap-detail-text">{readable(selected.description)}</p>
        </section>

        <section className="lwe-cap-detail-section">
          <h4>Capabilities</h4>
          <EmptyStatePanel
            title="No capabilities linked"
            detail="This agent is registered, but the current backend registry does not expose capability associations for this agent (verified: /agents/bus/resolve is non-functional)."
          />
        </section>

        <section className="lwe-cap-detail-section">
          <h4>Providers</h4>
          <EmptyStatePanel
            title="No providers linked"
            detail={`Not applicable — see the Capabilities registry (${capabilities.length} total) separately.`}
          />
        </section>

        <RawDataBlock data={selected} />
      </div>}
    </div>
  </div>
}

// ─── Capability View ────────────────────────────────────────────────────
function CapabilityView({ capabilities, selected, onSelect }: {
  capabilities: CapabilityCard[]; selected: CapabilityCard | null; onSelect: (c: CapabilityCard) => void
}) {
  return <div className="lwe-cap-split">
    <div className="lwe-cap-list">
      <div className="lwe-cap-list-header"><span>Capabilities</span><span>{capabilities.length}</span></div>
      <div className="lwe-cap-list-rows">
        {capabilities.map((c) => (
          <button key={c.name} type="button" className={`lwe-cap-list-row${selected?.name === c.name ? ' is-selected' : ''}`} onClick={() => onSelect(c)}>
            <StatusDot ok={c.available} />
            <span className="lwe-cap-list-row-label">{c.name}</span>
          </button>
        ))}
        {capabilities.length === 0 && <div className="lwe-cap-list-empty">No capabilities match.</div>}
      </div>
    </div>
    <div className="lwe-cap-detail">
      {!selected && <div className="lwe-cap-detail-empty">Select a capability to inspect it.</div>}
      {selected && <div className="lwe-cap-detail-inner">
        <div className="lwe-cap-detail-header">
          <h3>{selected.name}</h3>
          <span className={`lwe-cap-status-pill${selected.available ? '' : ' is-off'}`}>
            <StatusDot ok={selected.available} />{selected.available ? 'Available' : 'Unavailable'}
          </span>
        </div>

        <section className="lwe-cap-detail-section">
          <h4>Implementation</h4>
          <p className="lwe-cap-detail-text lwe-gg-mono">{selected.type}</p>
        </section>

        <section className="lwe-cap-detail-section">
          <h4>Description</h4>
          <p className="lwe-cap-detail-text">{readable(selected.description)}</p>
        </section>

        <section className="lwe-cap-detail-section">
          <h4>Agents exposing it</h4>
          <EmptyStatePanel
            title="No agent associations linked"
            detail="No live registry in this backend links agents to specific capabilities."
          />
        </section>

        <section className="lwe-cap-detail-section">
          <h4>Dependencies</h4>
          <EmptyStatePanel
            title="No dependency data linked"
            detail="Not available — no capability-dependency data is exposed by this backend."
          />
        </section>

        <RawDataBlock data={selected} />
      </div>}
    </div>
  </div>
}

// ─── Execution View — the real, separate domain capability bus ─────────
function ExecutionView({ capabilities }: { capabilities: CapabilityCard[] }) {
  const [actors, setActors] = useState<Actor[]>([])
  const [actorId, setActorId] = useState('')
  const [executions, setExecutions] = useState<ExecutionHistoryEntry[]>([])
  const [selectedExec, setSelectedExec] = useState<ExecutionHistoryEntry | null>(null)
  const [snapshot, setSnapshot] = useState<ContextSnapshotDto | null>(null)
  const [snapshotError, setSnapshotError] = useState('')

  useEffect(() => {
    fetchAllActors().then((all) => {
      const humans = all.filter((a) => a.actor_type === 'human')
      setActors(humans)
      setActorId((cur) => cur || humans.find((a) => a.name.toLowerCase() === 'priya sharma')?.actor_id || humans[0]?.actor_id || '')
    })
  }, [])

  useEffect(() => {
    if (!actorId) return
    fetchActorCognitiveState(actorId).then((result) => {
      const sorted = [...result.execution_history].sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0))
      setExecutions(sorted)
      setSelectedExec(sorted[0] ?? null)
    })
  }, [actorId])

  useEffect(() => {
    setSnapshot(null); setSnapshotError('')
    const execId = selectedExec && typeof selectedExec.metadata.execution_id === 'string' ? selectedExec.metadata.execution_id : ''
    if (!actorId || !execId) return
    fetchExecutionPlanningContext(actorId, execId)
      .then(setSnapshot)
      .catch((err) => setSnapshotError(err instanceof Error ? err.message : String(err)))
  }, [actorId, selectedExec])

  const used = new Set(selectedExec?.capabilities_used ?? [])
  const available = new Set(snapshot?.available_capabilities ?? [])
  const wolverineNames = useMemo(() => new Set(capabilities.map((c) => c.name)), [capabilities])
  const overlap = [...used].filter((name) => wolverineNames.has(name))

  return <div className="lwe-cap-execution">
    <div className="lwe-cap-exec-picker">
      <select aria-label="Actor" className="lwe-affiliation-actor-select" value={actorId} onChange={(e) => setActorId(e.target.value)}>
        {actors.map((a) => <option key={a.actor_id} value={a.actor_id}>{a.name}</option>)}
      </select>
      <select aria-label="Execution" value={selectedExec?.entry_id ?? ''} onChange={(e) => setSelectedExec(executions.find((x) => x.entry_id === e.target.value) ?? null)}>
        {executions.map((x) => <option key={x.entry_id} value={x.entry_id}>{formatTime(x.start_time)} — {readable(x.goal).slice(0, 40)} — {x.outcome}</option>)}
      </select>
    </div>

    {!selectedExec && <div className="lwe-inspector-muted">No executions recorded for this actor.</div>}

    {selectedExec && <>
      <p className="lwe-cap-exec-note">
        Capabilities used/available here belong to the grocery-domain CommerceCapabilityBus (a separate real bus this execution actually ran against) — not the {capabilities.length}-capability Wolverine registry above.
        {overlap.length > 0
          ? ` ${overlap.length} of ${used.size} used capabilities also match a Wolverine registry name: ${overlap.join(', ')}.`
          : used.size > 0 ? ` None of the ${used.size} used capabilities match a Wolverine registry name — confirmed separate namespaces, not assumed.` : ''}
      </p>

      <div className="lwe-cap-exec-columns">
        <div>
          <div className="lwe-cap-tier-heading"><span className="lwe-cap-tier-badge lwe-cap-tier-badge-used">USED</span><span className="lwe-cap-tier-count">{used.size}</span></div>
          <ul className="lwe-inspector-list">
            {[...used].map((name) => <li key={name}>{name}</li>)}
            {used.size === 0 && <li className="lwe-inspector-muted">None recorded.</li>}
          </ul>
        </div>
        <div>
          <div className="lwe-cap-tier-heading"><span className="lwe-cap-tier-badge lwe-cap-tier-badge-available">AVAILABLE, NOT USED</span><span className="lwe-cap-tier-count">{[...available].filter((n) => !used.has(n)).length}</span></div>
          {snapshotError && <div className="lwe-inspector-muted">Grounding snapshot not available for this execution — see Grounding Graph for the same known gap.</div>}
          <ul className="lwe-inspector-list">
            {[...available].filter((n) => !used.has(n)).map((name) => <li key={name}>{name}</li>)}
          </ul>
        </div>
      </div>
      {selectedExec.outcome !== 'success' && (
        <div className="lwe-gg-error">
          Execution outcome: {selectedExec.outcome}{selectedExec.failure_reason ? ` — ${readable(selectedExec.failure_reason)}` : ''}.
          This backend does not persist per-capability pass/fail, only one execution-level failure_reason — not attributed to a specific capability above.
        </div>
      )}
    </>}
  </div>
}
