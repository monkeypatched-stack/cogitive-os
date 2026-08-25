import { apiClient } from './client'
import type { Society } from './actorClient'

// GET /societies/{id} (existing route, societies.py::get_society) — a
// single Society's own detail, reusing the same shape GET /societies
// (actorClient.fetchSocieties) already returns per item.
export function fetchSociety(societyId: string): Promise<Society> {
  return apiClient.request<Society>(`/societies/${societyId}`)
}

export interface GovernancePolicy {
  policy_id: string
  name: string
  description: string
  policy_type: string
  rules: string[]
  scope: string
  priority: number
  enabled: boolean
}

export function fetchGovernancePolicies(societyId: string): Promise<GovernancePolicy[]> {
  return apiClient.request<{ society_id: string; policies: GovernancePolicy[] }>(`/societies/${societyId}/governance-policies`).then((r) => r.policies)
}

// Mirrors the new GET /societies/{id}/members route (societies.py) —
// is_temporary distinguishes a presence-derived coordination
// participant (MembershipGovernor, granted while occupying a Space
// this Society hosts) from a real SocietyMembershipRegistry member.
export interface SocietyMember {
  actor_id: string
  name: string
  actor_type: string
  status: string
  is_active: boolean
  is_temporary: boolean
}

interface SocietyMembersResponse {
  society_id: string
  members: SocietyMember[]
}

export async function fetchSocietyMembers(societyId: string): Promise<SocietyMember[]> {
  const res = await apiClient.request<SocietyMembersResponse>(`/societies/${societyId}/members`)
  return res.members
}

// Membership as a First-Class Runtime Resource (memberships.py) — the
// canonical Actor<->Society relationship record, carrying roles/status/
// trust that GET /societies/{id}/members (a flat actor-facing summary
// with no membership_id) doesn't expose and can't be mutated through.
export interface Membership {
  membership_id: string
  actor_id: string
  society_id: string
  team_id: string
  roles: string[]
  status: string
  trust_score: number
}

export function fetchSocietyMemberships(societyId: string): Promise<Membership[]> {
  return apiClient.request<Membership[]>(`/memberships/society/${societyId}`)
}

export interface MembershipCreateInput {
  actor_id: string
  society_id: string
  role?: string
}

export function createMembership(input: MembershipCreateInput): Promise<Membership> {
  return apiClient.request<Membership>('/memberships', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function addMembershipRole(membershipId: string, role: string): Promise<Membership> {
  return apiClient.request<Membership>(`/memberships/${membershipId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
}

export function removeMembershipRole(membershipId: string, role: string): Promise<Membership> {
  return apiClient.request<Membership>(`/memberships/${membershipId}/roles/${encodeURIComponent(role)}`, { method: 'DELETE' })
}

export function deleteMembership(membershipId: string): Promise<void> {
  return apiClient.request<void>(`/memberships/${membershipId}`, { method: 'DELETE' })
}

// Mirrors AffiliationCommunicationRouter.CommunicationDecision — a real
// record of one actor-to-actor message this society's runtime actually
// routed (or denied), not a synthesized eligibility graph.
export interface CommunicationLogEntry {
  decision_id: string
  sender_id: string
  recipient_id: string
  allowed: boolean
  reason: string
  affiliation_id: string
  society_id: string
  correlation_id?: string
  causation_id?: string
}

interface CommunicationLogResponse {
  society_id: string
  entries: CommunicationLogEntry[]
}

export async function fetchSocietyCommunicationLog(societyId: string): Promise<CommunicationLogEntry[]> {
  const res = await apiClient.request<CommunicationLogResponse>(`/societies/${societyId}/communication-log`)
  return res.entries
}
