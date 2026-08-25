import { apiClient } from './client'

export interface Actor {
  actor_id: string
  name: string
  actor_type: string
  description: string
  status: string
  is_active: boolean
  societies: string[]
  goals?: string[]
  objective?: string
  policies?: string[]
  trust_level?: number
}

// GET /actors (vs. the legacy /planet/actors fetchActors() below calls) —
// one row per actor with societies properly aggregated. /planet/actors
// iterates per-society internally and emits a duplicate ActorResponse row
// per membership (419 rows for 51 actors, confirmed live) — real for its
// existing callers (they dedupe by actor_id via Map construction, so it's
// silently harmless there), but wrong for anything that needs an accurate
// one-row-per-actor count or aggregated societies[], like the world graph.
export function fetchAllActors(): Promise<Actor[]> {
  return apiClient.request<Actor[]>('/actors')
}

export interface ActorCapabilityEntry {
  name: string
  level?: string
}

export function fetchActorCapabilities(actorId: string): Promise<ActorCapabilityEntry[]> {
  return apiClient.request<{ actor_id: string; capabilities: ActorCapabilityEntry[] }>(`/actors/${actorId}/capabilities`).then((r) => r.capabilities)
}

export interface ActorBeliefs {
  actor_id: string
  beliefs: Record<string, unknown>
}

export interface ActorMemory {
  actor_id: string
  memory: Array<Record<string, unknown>>
}

export interface ActorGoals {
  actor_id: string
  goals: string[]
}

export interface ActorTimelineEntry {
  [key: string]: unknown
  start_time?: number
  end_time?: number | null
}

export interface ActorMembership {
  membership_id?: string
  society_id?: string
  team_id?: string
  roles?: string[]
  status?: string
  trust_score?: number
  start_time?: number
  end_time?: number | null
}

export interface Society {
  society_id: string
  name: string
  description?: string
  society_type?: string
  actor_count?: number
  active_actors?: number
  is_active?: boolean
}

/** User-facing label for the bootstrap society; the persisted ID/name remain unchanged. */
export function societyDisplayName(name: string): string {
  return name === 'Default Society' ? 'Human Society' : name
}

export interface SocietyContextEvent {
  event_id?: string
  event_type?: string
  actor_id?: string
  description?: string
  payload?: unknown
  timestamp?: number
  provenance?: string
  correlation_id?: string
  causation_id?: string
}

// GET /planet/actors — every active actor across every active society.
export function fetchActors(): Promise<Actor[]> {
  return apiClient.request<Actor[]>('/planet/actors')
}

export function fetchActor(actorId: string): Promise<Actor> {
  return apiClient.request<Actor>(`/actors/${actorId}`)
}

export function fetchActorBeliefs(actorId: string): Promise<ActorBeliefs> {
  return apiClient.request<ActorBeliefs>(`/actors/${actorId}/beliefs`)
}

export function fetchActorMemory(actorId: string): Promise<ActorMemory> {
  return apiClient.request<ActorMemory>(`/actors/${actorId}/memory`)
}

export function fetchActorGoals(actorId: string): Promise<ActorGoals> {
  return apiClient.request<ActorGoals>(`/actors/${actorId}/goals`)
}

// Mirrors the new GET /actors/{id}/affiliations route (actors.py) —
// every real Affiliation this actor holds (employment/education/family/
// extended/relationship), unlike GET .../relationships which filters
// down to the relationship subtype only.
export interface ActorAffiliation {
  affiliation_id: string
  affiliation_type: string
  target_id: string
  target_name: string
  trust_level: number
  category: string | null
  valid_from: string
  valid_until: string
}

export async function fetchActorAffiliations(actorId: string): Promise<ActorAffiliation[]> {
  const res = await apiClient.request<{ actor_id: string; affiliations: ActorAffiliation[] }>(
    `/actors/${actorId}/affiliations`,
  )
  return res.affiliations
}

export interface ActorAffiliationInput {
  affiliation_type: string
  target_id: string
  target_name?: string
  trust_level?: number
  valid_from?: string
  valid_until?: string
  permissions?: string[]
  policies?: string[]
  priority?: number
  metadata?: Record<string, unknown>
}

export function createActorAffiliation(actorId: string, input: ActorAffiliationInput): Promise<{ actor_id: string; affiliation: ActorAffiliation }> {
  return apiClient.request(`/actors/${actorId}/affiliations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
}

export function updateActorAffiliation(actorId: string, affiliationId: string, input: Partial<ActorAffiliationInput>): Promise<{ actor_id: string; affiliation: ActorAffiliation }> {
  return apiClient.request(`/actors/${actorId}/affiliations/${encodeURIComponent(affiliationId)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
}

export function deleteActorAffiliation(actorId: string, affiliationId: string): Promise<void> {
  return apiClient.request(`/actors/${actorId}/affiliations/${encodeURIComponent(affiliationId)}`, { method: 'DELETE' })
}

export function fetchActorTimeline(actorId: string): Promise<ActorTimelineEntry[]> {
  return apiClient.request<ActorTimelineEntry[]>(`/actors/${actorId}/timeline`)
}

export function fetchActorMemberships(actorId: string): Promise<ActorMembership[]> {
  return apiClient.request<ActorMembership[]>(`/actors/${actorId}/active-memberships`)
}

export function updateMembershipTrust(membershipId: string, trustScore: number): Promise<ActorMembership> {
  return apiClient.request(`/memberships/${encodeURIComponent(membershipId)}/trust`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trust_score: trustScore }),
  })
}

export function addMembershipRole(membershipId: string, role: string): Promise<ActorMembership> {
  return apiClient.request(`/memberships/${encodeURIComponent(membershipId)}/roles`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
  })
}

export function deleteMembership(membershipId: string): Promise<void> {
  return apiClient.request(`/memberships/${encodeURIComponent(membershipId)}`, { method: 'DELETE' })
}

export interface ActorCreateInput {
  name: string
  actor_type: string
  description?: string
}

export function createActor(input: ActorCreateInput): Promise<Actor> {
  return apiClient.request<Actor>('/actors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export interface ActorUpdateInput {
  name?: string
  description?: string
}

export function updateActor(actorId: string, input: ActorUpdateInput): Promise<Actor> {
  return apiClient.request<Actor>(`/actors/${actorId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function deleteActor(actorId: string): Promise<void> {
  return apiClient.request<void>(`/actors/${actorId}`, { method: 'DELETE' })
}

export function fetchSocieties(): Promise<Society[]> {
  return apiClient.request<Society[]>('/societies')
}

export interface SocietyCreateInput {
  name: string
  description?: string
  society_type?: string
}

export function createSociety(input: SocietyCreateInput): Promise<Society> {
  return apiClient.request<Society>('/societies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export interface SocietyUpdateInput {
  name?: string
  description?: string
}

export function updateSociety(societyId: string, input: SocietyUpdateInput): Promise<Society> {
  return apiClient.request<Society>(`/societies/${societyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function deleteSociety(societyId: string): Promise<void> {
  return apiClient.request<void>(`/societies/${societyId}`, { method: 'DELETE' })
}

export function fetchSocietyContext(societyId: string, eventType?: string): Promise<{ events: SocietyContextEvent[] }> {
  const query = eventType ? `?event_type=${encodeURIComponent(eventType)}&limit=5000` : ''
  return apiClient.request<{ events: SocietyContextEvent[] }>(`/societies/${societyId}/context${query}`)
}

export interface SpaceContents {
  space_id: string
  actor_ids: string[]
  society_ids: string[]
}

// GET /planet/geo/{id}/contents — only valid for Space-tier entities
// (kernel/society/integration.py::space_contents); real, current
// occupants (PresenceTimeline) and hosted societies.
export function fetchSpaceContents(spaceId: string): Promise<SpaceContents> {
  return apiClient.request<SpaceContents>(`/planet/geo/${spaceId}/contents`)
}
