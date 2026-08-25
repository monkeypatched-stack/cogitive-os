import type { ActorTimelineEntry, Actor } from '../api/actorClient'
import type { GeoEntity } from '../api/geoClient'
import type { Society } from '../api/actorClient'
import { readable } from '../components/inspectorPrimitives'

// ─── Real backend shape → visual taxonomy ──────────────────────────────────
// The backend persists exactly 10 TimelineKinds (kernel/timeline/entry.py):
// PRESENCE, MEMBERSHIP, GOAL, BELIEF, EXECUTION, RELATIONSHIP, ACTIVITY,
// INTENT, PLAN, DECISION. None of them carries an explicit "kind" string in
// to_dict() — every record is classified here by which real fields it
// actually has (space_id => Presence, intent_type => Intent, ...), the same
// shape-based dispatch TimelineQueryEngine.replay()'s caller already has to
// do. Every one of the 10 kinds gets a real category + human description —
// nothing falls through to a generic "Other" bucket.

export type Category = 'world' | 'observation' | 'belief' | 'grounding' | 'cognition' | 'action' | 'learning'

export const CATEGORY_COLOR: Record<Category, string> = {
  world: '#16A34A',
  observation: '#2563EB',
  belief: '#7C3AED',
  grounding: '#0891B2',
  cognition: '#4F46E5',
  action: '#EA580C',
  learning: '#DB2777',
}

export const CATEGORY_LABEL: Record<Category, string> = {
  world: 'World', observation: 'Observation', belief: 'Belief', grounding: 'Grounding',
  cognition: 'Cognition', action: 'Action', learning: 'Learning',
}

export type RawKind = 'presence' | 'membership' | 'goal' | 'belief' | 'execution' | 'relationship' | 'activity' | 'intent' | 'plan' | 'decision'

export function classify(entry: ActorTimelineEntry): RawKind {
  if ('space_id' in entry) return 'presence'
  if ('intent_type' in entry) return 'intent'
  if ('outcome' in entry && 'capabilities_used' in entry) return 'execution'
  if ('plan_id' in entry) return 'plan'
  if ('selected_strategy' in entry) return 'decision'
  if ('membership_id' in entry) return 'membership'
  if ('subject' in entry && 'predicate' in entry) return 'belief'
  if ('success_criteria' in entry) return 'goal'
  if ('kind' in entry && 'target_id' in entry) return 'relationship'
  if ('activity' in entry && 'presence_ids' in entry) return 'activity'
  return 'presence' // unreachable given the 10 real shapes, kept exhaustive-safe
}

export const KIND_CATEGORY: Record<RawKind, Category> = {
  presence: 'world', membership: 'world', relationship: 'world', activity: 'world',
  intent: 'observation',
  belief: 'belief',
  goal: 'cognition', plan: 'cognition', decision: 'cognition',
  execution: 'action',
}

export interface ResolveCtx {
  actorsById: Map<string, Actor>
  spacesById: Map<string, GeoEntity>
  societiesById: Map<string, Society>
}

const actorName = (ctx: ResolveCtx, id: string) => ctx.actorsById.get(id)?.name ?? id
const spaceName = (ctx: ResolveCtx, id: string) => ctx.spacesById.get(id)?.name ?? id
const societyName = (ctx: ResolveCtx, id: string) => {
  const s = ctx.societiesById.get(id)
  return s ? (s.name === 'Default Society' ? 'Human Society' : s.name) : id
}

// A KG-content string like "Large Eggs (Dozen) (asset, id=product_xxx,
// price=$4.79)" is real (context_engine.py::_explore_knowledge's own
// f-string) — strip the "(asset, id=..., price=...)" parenthetical so a
// belief/knowledge description reads as a sentence, not a raw record dump.
function shortenKnowledgeContent(content: string): string {
  const idx = content.indexOf(' (')
  return idx > 0 ? content.slice(0, idx) : content
}

// The real, structured part of that same parenthetical worth keeping —
// price is the one fact a belief's own (subject, value) pair otherwise
// loses entirely once shortenKnowledgeContent strips it.
function priceFromContent(content: string): string | null {
  const m = content.match(/price=\$([\d.]+)/)
  return m ? `$${m[1]}` : null
}

// A 'decision' entry's real, already-persisted metadata.decision_kind field
// (kernel/society/integration.py::_record_decision writes
// metadata["decision_kind"] = "negotiation" when the decision came from
// TransactionCoordinator/GameTheoryRuntime — see kernel/society/
// transaction.py and game_theory.py). No new TimelineKind, no second
// timeline: this reads a real field the DECISION entries already carry
// and were previously not distinguishing.
export function decisionKindOf(entry: ActorTimelineEntry): string | undefined {
  const meta = entry.metadata as Record<string, unknown> | undefined
  const kind = meta?.decision_kind
  return typeof kind === 'string' ? kind : undefined
}

// Real execution_id a negotiation-flavored decision belongs to, when
// present — the same id GET /actors/{id}/executions/{id}/negotiation is
// keyed by, so a Timeline entry can link straight to its full negotiation
// record without a second lookup mechanism.
export function negotiationExecutionIdOf(entry: ActorTimelineEntry): string | undefined {
  const meta = entry.metadata as Record<string, unknown> | undefined
  const id = meta?.execution_id
  return typeof id === 'string' && id ? id : undefined
}

export interface EventView {
  category: Category
  eventType: string
  title: string
  status?: 'success' | 'failure' | 'partial'
  durationMs?: number
  negotiationExecutionId?: string
}

export function describe(entry: ActorTimelineEntry, kind: RawKind, ctx: ResolveCtx): EventView {
  const category = KIND_CATEGORY[kind]
  const actor = actorName(ctx, entry.actor_id as string)
  switch (kind) {
    case 'presence':
      return { category, eventType: 'Location Changed', title: `${actor} moved to ${spaceName(ctx, entry.space_id as string)}` }
    case 'membership': {
      const status = entry.status as string
      return { category, eventType: 'Membership Changed', title: `${actor} ${status === 'active' ? 'joined' : status} ${societyName(ctx, entry.society_id as string)}` }
    }
    case 'relationship':
      return { category, eventType: 'Relationship Changed', title: `${actor} ${readable(entry.kind)} ${actorName(ctx, entry.target_id as string)}` }
    case 'activity':
      return { category, eventType: 'Activity', title: `${actor} is ${readable(entry.activity)}` }
    case 'intent': {
      const entities = (entry.entities as string[]) || []
      const type = (entry.intent_type as string) || 'request'
      return {
        category, eventType: 'Entity Resolution',
        title: entities.length > 0 ? `Resolved ${type.replace(/_/g, ' ')}: ${entities.join(', ')}` : `Resolved ${type.replace(/_/g, ' ')} — no named entities`,
      }
    }
    case 'goal':
      return { category, eventType: 'Goal', title: `${actor}'s goal: ${readable(entry.name)} (${readable(entry.status)})` }
    case 'plan': {
      const steps = (entry.step_descriptions as string[]) || []
      return {
        category, eventType: 'Plan Created',
        title: steps.length > 0 ? `Plan: ${steps.join(' → ')}` : `Plan generated (${readable(entry.status)})`,
        status: entry.status === 'completed' ? 'success' : entry.status === 'failed' ? 'failure' : undefined,
      }
    }
    case 'decision': {
      const isNegotiation = decisionKindOf(entry) === 'negotiation'
      return {
        category,
        eventType: isNegotiation ? 'Negotiation Decision' : 'Decision',
        title: isNegotiation
          ? `${actor} negotiated: ${readable(entry.reason) || readable(entry.selected_strategy)}`
          : `${actor} decided: ${readable(entry.reason) || readable(entry.selected_strategy)}`,
        negotiationExecutionId: isNegotiation ? negotiationExecutionIdOf(entry) : undefined,
      }
    }
    case 'belief': {
      const subject = readable(entry.subject)
      const rawValue = entry.value
      if (typeof rawValue === 'string') {
        const shortened = shortenKnowledgeContent(rawValue)
        const price = priceFromContent(rawValue)
        const sameAsSubject = shortened.trim().toLowerCase() === subject.trim().toLowerCase()
        const title = sameAsSubject
          ? `${actor} learned: ${subject}${price ? ` — ${price}` : ''}`
          : `${actor} learned: ${subject} — ${shortened}${price ? ` — ${price}` : ''}`
        return { category, eventType: 'Belief Updated', title }
      }
      return { category, eventType: 'Belief Updated', title: `${actor} learned: ${subject} — ${readable(rawValue)}` }
    }
    case 'execution': {
      const outcome = entry.outcome as 'success' | 'failure' | 'partial'
      const goal = readable(entry.goal)
      const meta = (entry.metadata as Record<string, unknown>) || {}
      return {
        category, eventType: outcome ? 'Response Generated' : 'Request Submitted',
        title: `"${goal}" → ${outcome}${entry.failure_reason ? `: ${readable(entry.failure_reason)}` : ''}`,
        status: outcome, durationMs: typeof meta.duration_ms === 'number' ? meta.duration_ms : undefined,
      }
    }
  }
}

export function executionIdOf(entry: ActorTimelineEntry): string {
  const meta = entry.metadata as Record<string, unknown> | undefined
  const id = meta?.execution_id
  return typeof id === 'string' ? id : ''
}

export function worldChangesOf(entry: ActorTimelineEntry): string[] {
  const meta = entry.metadata as Record<string, unknown> | undefined
  const changes = meta?.world_changes
  return Array.isArray(changes) ? changes.filter((c): c is string => typeof c === 'string') : []
}
