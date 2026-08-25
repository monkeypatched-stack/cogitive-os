import { apiClient } from './client'

interface OccupancyEntry {
  actor_id: string
  space_id: string
}

interface OccupancyResponse {
  occupancy: OccupancyEntry[]
}

// GET /presence — every actor with a currently-open Presence interval
// (kernel/timeline/presence.py::current_occupancy), actor_id -> the
// real Space they're in right now. Empty until something actually
// calls POST /actors/{id}/move — no actor movement UI exists yet, so
// this is honestly empty today, not broken.
export async function fetchCurrentOccupancy(): Promise<Record<string, string>> {
  const res = await apiClient.request<OccupancyResponse>('/presence')
  const byActorId: Record<string, string> = {}
  for (const entry of res.occupancy) byActorId[entry.actor_id] = entry.space_id
  return byActorId
}
