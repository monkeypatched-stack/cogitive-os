import { useEffect, useMemo, useRef, useState } from 'react'
import { PanelContainer } from './PanelContainer'
import { useWorldStore } from '../store/worldStore'
import { useCycleStore } from '../store/cycleStore'
import { useRefreshStore } from '../store/refreshStore'
import { TIER_LABELS } from './worldTree/treeUtils'
import { resolveWorldLocation } from '../lib/resolveLocation'
import {
  fetchSpaceContents, fetchActorAffiliations, type Society, type SpaceContents, type ActorAffiliation,
} from '../api/actorClient'
import { fetchSociety, fetchSocietyMembers, fetchSocietyCommunicationLog, type SocietyMember, type CommunicationLogEntry } from '../api/societyClient'
import { fetchActorCognitiveState, type ActorCognitiveState } from '../api/cognitiveClient'
import { fetchExecutionNarrative, type ExecutionNarrative } from '../api/narrativeClient'
import { ActorSection, ActorList, ActorTable, formatTime, readable } from './inspectorPrimitives'
import './InspectorPanel.css'

/**
 * Reacts to WorldTree's (or the Map's) selection via the shared
 * worldStore — the concrete, checkable proof that "selecting a node
 * notifies the rest of the UI" (Prompt 2) actually works, not just an
 * unread store write. Deliberately plain fact display, no
 * visualization (still within Prompt 1's "no visualization yet" scope).
 */
interface SocietyInspectorData {
  society: Society
  members: SocietyMember[]
  communicationLog: CommunicationLogEntry[]
  affiliationsByActorId: Record<string, ActorAffiliation[]>
}

export function InspectorPanel({ includeExecutionHistory = true, includeMemory = true, includePlanReplacementHistory = true, includePlanningSummary = true, includeSocietyView = true }: { includeExecutionHistory?: boolean; includeMemory?: boolean; includePlanReplacementHistory?: boolean; includePlanningSummary?: boolean; includeSocietyView?: boolean } = {}) {
  const selectedEntityId = useWorldStore((s) => s.selectedEntityId)
  const selectedActorId = useWorldStore((s) => s.selectedActorId)
  const selectedSocietyId = useWorldStore((s) => s.selectedSocietyId)
  const coordinatingSocietyIds = useCycleStore((s) => s.coordinatingSocietyIds)
  const lastCycleResult = useCycleStore((s) => s.lastResult)
  // Falls back to rawEntitiesById: the By Actor view can select a node
  // reached only via an actor's Society-hosted fallback (today, that's
  // always the hidden Default chain — see worldStore's rawEntitiesById
  // doc comment), which entitiesById deliberately excludes. The
  // Inspector's job is to show whatever is actually selected, not to
  // second-guess whether that selection is "supposed" to be visible.
  const entity = useWorldStore((s) =>
    s.selectedEntityId ? (s.entitiesById[s.selectedEntityId] ?? s.rawEntitiesById[s.selectedEntityId]) : null,
  )
  const rawEntitiesById = useWorldStore((s) => s.rawEntitiesById)
  const locationsById = useWorldStore((s) => s.locationsById)
  const actorsById = useWorldStore((s) => s.actorsById)
  const occupancyByActorId = useWorldStore((s) => s.occupancyByActorId)
  const societyToEntityId = useWorldStore((s) => s.societyToEntityId)

  const resolvedLocation = useMemo(
    () => (selectedEntityId ? resolveWorldLocation(rawEntitiesById, locationsById, selectedEntityId) : null),
    [rawEntitiesById, locationsById, selectedEntityId],
  )

  // space_contents (real occupants) is only meaningful for Space-tier
  // entities (kernel/society/integration.py::space_contents returns
  // None for anything else) — fetched on demand per selection, not
  // prefetched for every space up front.
  const [contents, setContents] = useState<SpaceContents | null>(null)
  const [contentsError, setContentsError] = useState('')
  const [cognitiveState, setCognitiveState] = useState<ActorCognitiveState | null>(null)
  const [actorDataError, setActorDataError] = useState('')
  const [actorDataLoading, setActorDataLoading] = useState(false)

  // Planetary Narrative: which Execution History row is expanded, and
  // the real, composed evidence fetched for it (GET .../narrative) —
  // fetched on demand per row click, not prefetched for every execution.
  const [narrativeExecutionId, setNarrativeExecutionId] = useState<string | null>(null)
  const [narrative, setNarrative] = useState<ExecutionNarrative | null>(null)
  const [narrativeError, setNarrativeError] = useState('')
  const [narrativeLoading, setNarrativeLoading] = useState(false)

  useEffect(() => {
    setContents(null)
    setContentsError('')
    if (!entity || entity.entity_type !== 'space') return
    let cancelled = false
    fetchSpaceContents(entity.entity_id)
      .then((result) => {
        if (!cancelled) setContents(result)
      })
      .catch((err) => {
        if (!cancelled) setContentsError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [entity])

  const refreshSeq = useRefreshStore((s) => s.refreshSeq)
  const lastActorIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Only clear (and show a loading flash) when switching to a
    // different actor — a refreshSeq-driven refetch of the SAME actor
    // (a real tick/prompt just changed its state) swaps in fresh data
    // quietly instead of flickering back to "None recorded" first.
    const switchingActor = lastActorIdRef.current !== selectedActorId
    lastActorIdRef.current = selectedActorId
    if (switchingActor) {
      setCognitiveState(null)
      setActorDataError('')
      setNarrativeExecutionId(null)
      setNarrative(null)
      setNarrativeError('')
    }
    if (!selectedActorId) return
    let cancelled = false
    setActorDataLoading(true)
    fetchActorCognitiveState(selectedActorId)
      .then((result) => {
        if (cancelled) return
        setCognitiveState(result)
        // First-class, not buried: the Planetary Narrative + Grounding
        // sections used to require an extra click on an Execution
        // History row before showing anything. Auto-select the most
        // recent real execution (newest-first, first one carrying a
        // real execution_id) so they render immediately once an actor
        // is selected — a row click still works, for inspecting an
        // older execution instead.
        setNarrativeExecutionId((current) => {
          if (current) return current
          const latest = result.execution_history.find(
            (e) => typeof e.metadata.execution_id === 'string' && e.metadata.execution_id,
          )
          return latest ? (latest.metadata.execution_id as string) : current
        })
      })
      .catch((err) => {
        if (!cancelled) setActorDataError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setActorDataLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedActorId, refreshSeq])

  useEffect(() => {
    if (!selectedActorId || !narrativeExecutionId) {
      setNarrative(null)
      setNarrativeError('')
      return
    }
    let cancelled = false
    setNarrativeLoading(true)
    fetchExecutionNarrative(selectedActorId, narrativeExecutionId)
      .then((result) => { if (!cancelled) { setNarrative(result); setNarrativeError('') } })
      .catch((err) => { if (!cancelled) setNarrativeError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setNarrativeLoading(false) })
    return () => { cancelled = true }
  }, [selectedActorId, narrativeExecutionId])

  const [societyData, setSocietyData] = useState<SocietyInspectorData | null>(null)
  const [societyDataError, setSocietyDataError] = useState('')
  const [societyDataLoading, setSocietyDataLoading] = useState(false)
  const lastSocietyIdRef = useRef<string | null>(null)

  useEffect(() => {
    const switchingSociety = lastSocietyIdRef.current !== selectedSocietyId
    lastSocietyIdRef.current = selectedSocietyId
    if (switchingSociety) {
      setSocietyData(null)
      setSocietyDataError('')
    }
    if (!selectedSocietyId) return
    let cancelled = false
    setSocietyDataLoading(true)
    Promise.all([
      fetchSociety(selectedSocietyId),
      fetchSocietyMembers(selectedSocietyId),
      fetchSocietyCommunicationLog(selectedSocietyId),
    ]).then(async ([society, members, communicationLog]) => {
      const affiliationResults = await Promise.allSettled(
        members.map((member) => fetchActorAffiliations(member.actor_id)),
      )
      const affiliationsByActorId: Record<string, ActorAffiliation[]> = {}
      affiliationResults.forEach((result, index) => {
        affiliationsByActorId[members[index].actor_id] = result.status === 'fulfilled' ? result.value : []
      })
      if (!cancelled) setSocietyData({ society, members, communicationLog, affiliationsByActorId })
    }).catch((err) => {
      if (!cancelled) setSocietyDataError(err instanceof Error ? err.message : String(err))
    }).finally(() => {
      if (!cancelled) setSocietyDataLoading(false)
    })
    return () => { cancelled = true }
  }, [selectedSocietyId, refreshSeq])

  if (selectedSocietyId && includeSocietyView) {
    const members = societyData?.members ?? []
    const permanentMembers = members.filter((m) => !m.is_temporary)
    const temporaryMembers = members.filter((m) => m.is_temporary)
    const memberNameById = Object.fromEntries(members.map((m) => [m.actor_id, m.name]))
    const affiliationRows = members.flatMap((member) =>
      (societyData?.affiliationsByActorId[member.actor_id] ?? []).map((affiliation) => ({
        Member: member.name,
        Type: affiliation.affiliation_type,
        Target: affiliation.target_name || affiliation.target_id,
        Trust: affiliation.trust_level,
      })),
    )
    const justCoordinated = coordinatingSocietyIds.has(selectedSocietyId)

    return <PanelContainer title="Society Inspector"><div className="lwe-inspector">
      <div className="lwe-inspector-tier">Society</div>
      <h3 className="lwe-inspector-name">{societyData?.society.name ?? selectedSocietyId}</h3>
      {societyDataLoading && <div className="lwe-inspector-muted">Loading society state...</div>}
      {societyDataError && <div className="lwe-inspector-error">Some society data could not be loaded: {societyDataError}</div>}

      {justCoordinated && (
        <div className="lwe-inspector-coordinated-banner">
          ⚡ This Society coordinated a request in the most recent Planetary Tick
          {lastCycleResult && ` (cycle ${lastCycleResult.cycle_number})`}.
        </div>
      )}

      {societyData?.society && <>
        <ActorSection title="Identity"><dl className="lwe-inspector-fields">
          <dt>Type</dt><dd>{societyData.society.society_type || 'generic'}</dd>
          <dt>Description</dt><dd>{societyData.society.description || 'Not available'}</dd>
        </dl></ActorSection>
        <ActorSection title="Members">
          <ActorTable columns={['Name', 'Type', 'Status']} rows={permanentMembers.map((m) => ({
            Name: m.name, Type: m.actor_type, Status: m.is_active ? m.status : `${m.status} (inactive)`,
          }))} />
        </ActorSection>
        <ActorSection title="Temporary Members">
          <ActorTable columns={['Name', 'Type', 'Status']} rows={temporaryMembers.map((m) => ({
            Name: m.name, Type: m.actor_type, Status: m.is_active ? m.status : `${m.status} (inactive)`,
          }))} />
        </ActorSection>
        <ActorSection title="Affiliations">
          <ActorTable columns={['Member', 'Type', 'Target', 'Trust']} rows={affiliationRows} />
        </ActorSection>
        <ActorSection title="Communication links">
          <ActorTable columns={['From', 'To', 'Allowed', 'Reason']} rows={(societyData?.communicationLog ?? []).map((entry) => ({
            From: memberNameById[entry.sender_id] ?? entry.sender_id,
            To: memberNameById[entry.recipient_id] ?? entry.recipient_id,
            Allowed: entry.allowed ? 'Yes' : 'No',
            Reason: entry.reason,
          }))} />
        </ActorSection>
      </>}
    </div></PanelContainer>
  }

  if (selectedActorId) {
    const cs = cognitiveState
    const name = cs?.identity.name ?? actorsById[selectedActorId]?.name ?? selectedActorId
    // Presence: the real, direct answer (cs.presence) first; falls back
    // to the actor's Society-hosted location exactly like the World
    // Tree's own "By Actor" view already does, so this Inspector and
    // that tree never disagree about where an unlocated actor "is."
    const spaceId = cs?.presence?.space_id || occupancyByActorId[selectedActorId]
    const fallbackHostId = !spaceId && cs?.current_society ? societyToEntityId[cs.current_society.society_id] : null
    const actorLocation = resolveWorldLocation(rawEntitiesById, locationsById, spaceId || fallbackHostId || '')

    const decision = cs?.decision ?? null
    const planDecision = cs?.plan_decision ?? null
    const planHysteresisHistory = (cs?.decision_history ?? []).filter(
      (d) => (d.metadata as { decision_kind?: string } | undefined)?.decision_kind === 'plan_hysteresis',
    )
    const latestBelief = cs?.beliefs[0]
    const planHasSteps = !!cs?.current_plan?.steps.length
    const planHasDescriptions = !!cs?.current_plan?.step_descriptions.length

    return <PanelContainer title="Actor Inspector"><div className="lwe-inspector">
      <div className="lwe-inspector-tier">Cognitive debugger</div>
      <h3 className="lwe-inspector-name">{name}</h3>
      {actorDataLoading && <div className="lwe-inspector-muted">Loading cognitive state...</div>}
      {actorDataError && <div className="lwe-inspector-error">Some actor data could not be loaded: {actorDataError}</div>}
      {cs && <>
        <ActorSection title="Identity"><dl className="lwe-inspector-fields">
          <dt>Name</dt><dd>{cs.identity.name}</dd>
          <dt>Role</dt><dd>{cs.identity.actor_type || 'actor'}</dd>
          <dt>Description</dt><dd>{cs.identity.description || 'Not available'}</dd>
          <dt>Status</dt><dd>{cs.identity.status || (cs.identity.is_active ? 'active' : 'inactive')}</dd>
        </dl></ActorSection>
        <ActorSection title="Presence">
          <div className="lwe-inspector-value">
            {actorLocation?.location.address || actorLocation?.location.name || 'Not currently located'}
            {!spaceId && fallbackHostId && (
              <span className="lwe-inspector-address-inherited"> (inherited from this actor's Society)</span>
            )}
          </div>
        </ActorSection>
        <ActorSection title="Affiliations"><ActorTable columns={['Type', 'Target', 'Trust', 'Category']} rows={cs.affiliations.map((a) => ({
          Type: a.affiliation_type, Target: a.target_name || a.target_id, Trust: a.trust_level, Category: a.category || 'Not available',
        }))} /></ActorSection>
        <ActorSection title="Current Society"><div className="lwe-inspector-value">{cs.current_society?.name ?? 'Not affiliated with any Society'}</div></ActorSection>

        <ActorSection title="Intent">
          {cs.intent ? <dl className="lwe-inspector-fields">
            <dt>Type</dt><dd>{cs.intent.intent_type || 'Not available'}</dd>
            <dt>Confidence</dt><dd>{cs.intent.confidence.toFixed(2)}</dd>
            {cs.intent.entities.length > 0 && <><dt>Entities</dt><dd>{cs.intent.entities.join(', ')}</dd></>}
            {cs.intent.constraints.length > 0 && <><dt>Constraints</dt><dd>{cs.intent.constraints.join(', ')}</dd></>}
          </dl> : <div className="lwe-inspector-muted">None recorded.</div>}
        </ActorSection>
        <ActorSection title="Goals">
          {cs.goals.length > 0 ? <ActorTable columns={['Name', 'Priority', 'Status', 'Success Criteria']} rows={cs.goals.map((g) => ({
            Name: g.name, Priority: g.priority, Status: g.status,
            'Success Criteria': g.success_criteria.join(', ') || 'Not available',
          }))} /> : <div className="lwe-inspector-muted">No active goals.</div>}
        </ActorSection>
        <ActorSection title="Goal Executions">
          <div className="lwe-inspector-hint">A goal is persistent; each real request against it is a separate execution below it.</div>
          {cs.goal_executions.length > 0 ? cs.goal_executions.map((group) => (
            <div className="lwe-inspector-goal-group" key={group.goal}>
              <h5>{group.goal}</h5>
              <ActorTable columns={['Time', 'Requested', 'Outcome']} rows={group.executions.map((e) => ({
                Time: formatTime(e.timestamp), Requested: e.requested, Outcome: e.outcome || 'Not available',
              }))} />
            </div>
          )) : <div className="lwe-inspector-muted">None recorded.</div>}
        </ActorSection>
        <ActorSection title="Beliefs">
          <div className="lwe-inspector-hint">This actor's current understanding, one row per subject — see Memory — Semantic below for durable, cross-tick knowledge.</div>
          <ActorTable columns={['Subject', 'Belief', 'Confidence', 'Observations', 'Last Updated', 'Evidence']} rows={cs.beliefs.map((b) => ({
            Subject: b.subject, Belief: readable(b.value), Confidence: b.confidence.toFixed(2),
            Observations: readable(b.metadata.observation_count), 'Last Updated': formatTime(b.start_time),
            Evidence: readable(b.metadata.evidence),
          }))} />
        </ActorSection>
        {includePlanningSummary && <>
        <ActorSection title="Domain Plan">
          {cs.current_plan ? <dl className="lwe-inspector-fields">
            <dt>Goal</dt><dd>{cs.current_plan.goal || 'Not available'}</dd>
            <dt>Status</dt><dd>{cs.current_plan.status}</dd>
            <dt>Progress</dt><dd>{cs.current_plan.completed_nodes} / {cs.current_plan.node_count} completed</dd>
            <dt>Steps</dt><dd>
              {!planHasSteps && 'No steps'}
              {planHasSteps && planHasDescriptions && cs.current_plan.step_descriptions.join(' → ')}
              {planHasSteps && !planHasDescriptions && (
                <>
                  <div className="lwe-inspector-plan-stale">
                    This plan predates domain descriptions being tracked for
                    this actor — showing internal step names as a fallback.
                    Send this actor a new message to get a real domain plan.
                  </div>
                  {cs.current_plan.steps.join(' → ')}
                </>
              )}
            </dd>
            <dt>Confidence</dt><dd>{cs.current_plan.confidence.toFixed(2)}</dd>
            <dt>Risk</dt><dd>{cs.current_plan.risk.toFixed(2)}</dd>
            {cs.current_plan.score !== undefined && <>
              <dt>Hysteresis Score</dt><dd>{cs.current_plan.score.toFixed(3)}</dd>
              <dt>Age</dt><dd>
                {cs.current_plan.age_seconds !== undefined
                  ? `${Math.round(cs.current_plan.age_seconds)}s ago`
                  : formatTime(cs.current_plan.created_at)}
              </dd>
              <dt>Kept For</dt><dd>{cs.current_plan.kept_count ?? 0} tick(s)</dd>
            </>}
          </dl> : <div className="lwe-inspector-muted">None recorded.</div>}
          <div className="lwe-inspector-hint">
            What the actor intends to accomplish — the runtime capabilities
            actually invoked (EvaluateStrategy, BroadcastToAffiliation, ...)
            are implementation detail; see the Execution Graph panel.
          </div>
        </ActorSection>
        <ActorSection title="Decision">
          {decision ? <dl className="lwe-inspector-fields">
            <dt>Selected Strategy</dt><dd>{decision.selected_strategy || 'Not available'}</dd>
            <dt>Reason</dt><dd>{decision.reason || 'Not available'}</dd>
            <dt>Utility</dt><dd>
              {decision.utility.toFixed(2)}
              <div className="lwe-inspector-hint">Expected value across the plan's compound success probability on a +1/-1 scale — a multi-step plan's joint probability can fall below 50%, making this negative even when the run ultimately succeeds.</div>
            </dd>
            <dt>Confidence</dt><dd>
              {decision.confidence.toFixed(2)}
              <div className="lwe-inspector-hint">The minimum per-step evidence confidence across the plan — one step with no learned history (e.g. an action never executed before) pulls this to 0, even if the predicted probability above is high.</div>
            </dd>
          </dl> : <div className="lwe-inspector-muted">No negotiation/coordination decision recorded yet.</div>}
        </ActorSection>
        <ActorSection title="Candidate Futures">
          {(decision?.candidates?.length ?? 0) > 1
            ? <ActorTable columns={['Name', 'Utility']} rows={(decision?.candidates ?? []).map((c) => ({
                Name: c.name || 'Not available', Utility: c.utility?.toFixed(2) ?? 'Not available',
              }))} />
            : (decision?.candidates?.length ?? 0) === 1
              ? <>
                  <div className="lwe-inspector-hint">No alternative strategies were generated for this request.</div>
                  <ActorTable columns={['Name', 'Utility']} rows={(decision?.candidates ?? []).map((c) => ({
                    Name: c.name || 'Not available', Utility: c.utility?.toFixed(2) ?? 'Not available',
                  }))} />
                </>
              : <div className="lwe-inspector-muted">None recorded.</div>}
        </ActorSection>

        <ActorSection title="Plan Decision">
          {planDecision ? <>
            <dl className="lwe-inspector-fields">
              <dt>Decision</dt><dd>{planDecision.selected_strategy || 'Not available'}</dd>
              <dt>Reason</dt><dd>{planDecision.reason || 'Not available'}</dd>
            </dl>
            <ActorTable columns={['Name', 'Score']} rows={(planDecision.candidates ?? []).map((c) => ({
              Name: c.name || 'Not available',
              Score: typeof c.score === 'number' ? c.score.toFixed(3) : (c.utility?.toFixed?.(3) ?? 'Not available'),
            }))} />
          </> : <div className="lwe-inspector-muted">No plan-hysteresis decision recorded yet.</div>}
        </ActorSection>
        </>}
        {includePlanReplacementHistory && <ActorSection title="Plan Replacement History">
          {planHysteresisHistory.length > 0
            ? <ActorTable columns={['Time', 'Action', 'Reason', 'New Score', 'Current Score']} rows={planHysteresisHistory.map((d) => {
                const current = d.candidates?.find((c) => c.name === 'current_plan')
                const next = d.candidates?.find((c) => c.name === 'new_plan')
                return {
                  Time: formatTime(d.start_time), Action: d.selected_strategy || 'Not available',
                  Reason: d.reason || 'Not available',
                  'New Score': typeof next?.score === 'number' ? next.score.toFixed(3) : 'Not available',
                  'Current Score': typeof current?.utility === 'number' ? current.utility.toFixed(3) : 'Not available',
                }
              })} />
            : <div className="lwe-inspector-muted">None recorded.</div>}
        </ActorSection>}

        {includeMemory && <>
        <ActorSection title="Memory — Semantic">
          <div className="lwe-inspector-hint">Durable knowledge — facts that have recurred across 2+ ticks, not just this tick's beliefs.</div>
          <ActorTable columns={['Subject', 'Belief', 'Confidence']} rows={cs.memory_semantic.map((entry) => {
            const best = [...entry.hypotheses].sort((a, b) => b.confidence - a.confidence)[0]
            return { Subject: entry.subject, Belief: readable(best?.object_value), Confidence: best?.confidence.toFixed(2) ?? 'Not available' }
          })} />
        </ActorSection>
        <ActorSection title="Memory — Episodic">
          {cs.memory_episodic.length > 0 ? cs.memory_episodic.map((item) => {
            const steps = Array.isArray(item.metadata.steps) ? item.metadata.steps as string[] : []
            const chain = steps.length > 0
              ? ['Requested', ...steps, item.kind === 'task_failed' ? 'Outcome: Failed' : 'Outcome: Success']
              : null
            return <div className="lwe-inspector-episode" key={item.node_id}>
              <time className="lwe-inspector-episode-time">{formatTime(item.timestamp)}</time>
              {chain ? <div className="lwe-inspector-episode-chain">{chain.join(' → ')}</div>
                : <div className="lwe-inspector-episode-text">{item.text}</div>}
            </div>
          }) : <div className="lwe-inspector-muted">None recorded.</div>}
        </ActorSection>
        <ActorSection title="Memory — Conversation"><ActorTable columns={['Time', 'Type', 'Summary']} rows={cs.memory_conversation.map((event) => ({
          Time: formatTime(event.timestamp), Type: event.event_type || 'interaction', Summary: event.description || 'Not available',
        }))} /></ActorSection>
        </>}

        <ActorSection title="Execution — Current Tick"><dl className="lwe-inspector-fields">
          <dt>Cycle Count</dt><dd>{cs.identity.cycle_count}</dd>
          <dt>Status</dt><dd>{cs.identity.status}</dd>
        </dl></ActorSection>
        {includeExecutionHistory && <ActorSection title="Execution History">
          <div className="lwe-inspector-hint">World Changes are the real, persisted effects this execution had — not every capability reports one (e.g. a decision-required step that didn't complete a purchase legitimately has none). The Planetary Narrative below is for the most recent execution automatically — click a different row to inspect an older one. See the Data Sources panel for what grounded this actor's planning (Knowledge Graph, Context Stream, Semantic Memory, External Events, Context Diff).</div>
          <ActorTable
            columns={['Time', 'Outcome', 'Goal', 'World Changes', 'Reward', 'Loss', 'Duration (ms)']}
            rows={cs.execution_history.map((e) => ({
              Time: formatTime(e.start_time), Outcome: e.outcome, Goal: e.goal || 'Not available',
              'World Changes': Array.isArray(e.metadata.world_changes) && (e.metadata.world_changes as unknown[]).length > 0
                ? (e.metadata.world_changes as string[]).join('; ') : 'None recorded.',
              Reward: e.reward?.toFixed(2) ?? 'Not available', Loss: e.actor_loss?.toFixed(2) ?? 'Not available',
              'Duration (ms)': typeof e.metadata.duration_ms === 'number' ? e.metadata.duration_ms.toFixed(1) : 'Not available',
              _execution_id: typeof e.metadata.execution_id === 'string' ? e.metadata.execution_id : '',
            }))}
            onRowClick={(row) => {
              const id = row._execution_id as string
              if (!id) return
              setNarrativeExecutionId((current) => (current === id ? null : id))
            }}
            selectedIndex={cs.execution_history.findIndex((e) => e.metadata.execution_id === narrativeExecutionId)}
          />
          {narrativeExecutionId && <div className="lwe-inspector-narrative">
            {narrativeLoading && <div className="lwe-inspector-muted">Loading narrative…</div>}
            {narrativeError && <div className="lwe-inspector-narrative-error">{narrativeError}</div>}
            {narrative && <>
              <div><h5>What Happened</h5><div className="lwe-inspector-value">{narrative.what_happened}</div></div>
              <div><h5>Why</h5><div className="lwe-inspector-value">{narrative.why}</div></div>
              <div>
                <h5>Who Did What</h5>
                <div className="lwe-inspector-value">
                  {narrative.who_did_what.actor}
                  {narrative.who_did_what.capabilities_used.length > 0 && <> — {narrative.who_did_what.capabilities_used.join(', ')}</>}
                </div>
                {narrative.who_did_what.colleagues_involved.length > 0 && (
                  <div className="lwe-inspector-hint">Colleagues involved: {narrative.who_did_what.colleagues_involved.join(', ')}</div>
                )}
              </div>
              <div>
                <h5>How (Pipeline)</h5>
                <div className="lwe-inspector-value">{narrative.how.pipeline_stages.join(' → ')}</div>
              </div>
              <div>
                <h5>Conversation</h5>
                {narrative.conversation.message_count > 0
                  ? <ActorTable columns={['Time', 'From', 'Content']} rows={narrative.conversation.messages.map((m) => ({
                      Time: formatTime(m.timestamp), From: m.actor_id,
                      Content: (m.payload && (m.payload.question || m.payload.answer || m.payload.message)) || m.description,
                    }))} />
                  : <div className="lwe-inspector-muted">No messages were exchanged for this execution.</div>}
              </div>
              <div>
                <h5>Negotiation &amp; Game Theory</h5>
                <div className="lwe-inspector-value">{narrative.negotiation.reason}</div>
                {narrative.negotiation.negotiation_required && (
                  <ActorTable columns={['Strategy', 'Utility']} rows={(narrative.negotiation.utility_evaluation ?? []).map((c) => ({
                    Strategy: c.name ?? 'Not available', Utility: c.utility?.toFixed?.(2) ?? c.utility ?? 'Not available',
                  }))} />
                )}
              </div>
              <div>
                <h5>Society Coordination</h5>
                <div className="lwe-inspector-hint">{narrative.society_coordination.reason}</div>
              </div>
              <div>
                <h5>World Changes</h5>
                {narrative.world_changes.length > 0
                  ? <ActorList items={narrative.world_changes} />
                  : <div className="lwe-inspector-muted">None recorded.</div>}
              </div>
              <div>
                <h5>Learning</h5>
                <div className="lwe-inspector-value">
                  {narrative.learning.learned ? 'This execution produced real world changes the actor learned from.' : 'No learning signal was recorded for this execution.'}
                </div>
              </div>
            </>}
          </div>}
        </ActorSection>}

        <ActorSection title="Explainability">
          <div className="lwe-inspector-explainability">
            <h5>Evidence</h5>
            <ActorList items={latestBelief ? (latestBelief.metadata.evidence as unknown[] ?? []) : (decision?.evidence ?? [])} />
            <h5>Reason</h5>
            <div className="lwe-inspector-value">
              {cs.current_plan?.goal && <>Goal: {cs.current_plan.goal}<br /></>}
              {decision?.reason || (latestBelief ? readable(latestBelief.metadata.reason) : 'Not available')}
            </div>
            <h5>Confidence</h5>
            <div className="lwe-inspector-value">
              {decision ? decision.confidence.toFixed(2) : latestBelief ? latestBelief.confidence.toFixed(2) : 'Not available'}
            </div>
          </div>
        </ActorSection>
      </>}
    </div></PanelContainer>
  }

  if (!selectedEntityId || !entity) {
    return <PanelContainer title="Inspector" />
  }

  return (
    <PanelContainer title="Inspector">
      <div className="lwe-inspector">
        <div className="lwe-inspector-tier">{TIER_LABELS[entity.entity_type]}</div>
        <h3 className="lwe-inspector-name">{entity.name}</h3>
        {entity.description && <p className="lwe-inspector-description">{entity.description}</p>}

        {resolvedLocation && (
          <div className="lwe-inspector-address">
            {resolvedLocation.location.address || resolvedLocation.location.name}
            {!resolvedLocation.own && (
              <span className="lwe-inspector-address-inherited"> (inherited from an ancestor)</span>
            )}
            <div className="lwe-inspector-latlon">
              {resolvedLocation.location.latitude.toFixed(5)}, {resolvedLocation.location.longitude.toFixed(5)}
            </div>
          </div>
        )}

        <dl className="lwe-inspector-fields">
          <dt>ID</dt>
          <dd>{entity.entity_id}</dd>
          <dt>Parent</dt>
          <dd>{entity.parent_id ?? '(none — root)'}</dd>
          <dt>Children</dt>
          <dd>{entity.child_ids.length}</dd>
          <dt>Hosted societies</dt>
          <dd>{entity.hosted_society_ids.length}</dd>
        </dl>

        {entity.entity_type === 'space' && (
          <div className="lwe-inspector-occupants">
            <div className="lwe-inspector-occupants-title">Occupants</div>
            {contentsError && <div className="lwe-inspector-error">{contentsError}</div>}
            {!contentsError && contents === null && <div className="lwe-inspector-muted">Loading...</div>}
            {contents && contents.actor_ids.length === 0 && (
              <div className="lwe-inspector-muted">No actors currently present.</div>
            )}
            {contents && contents.actor_ids.length > 0 && (
              <ul className="lwe-inspector-occupants-list">
                {contents.actor_ids.map((actorId) => (
                  <li key={actorId}>{actorsById[actorId]?.name ?? actorId}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </PanelContainer>
  )
}
