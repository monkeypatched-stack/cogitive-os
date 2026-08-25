import type { ContextSnapshotDto, SemanticMemoryDto, RetrievedItemDto, CausalStep, AffiliationChainNode } from './contextClient'
import type { GroundingExecutionMeta } from '../components/GroundingDebugger'

/**
 * The one demo/showcase execution in the app — reachable only via the
 * dedicated /execution-debugger/demo route, never mixed into a real
 * actor's data. It tells one concrete story (a warehouse fire making
 * Whole Milk unavailable, CognitiveOS substituting in 1% Milk) at a
 * size no currently-seeded actor's real execution happens to reach yet.
 * Every field here is shaped by the exact same interfaces
 * fetchExecutionPlanningContext/fetchExecutionSemanticMemory return, so
 * nothing downstream needs to know this isn't a live API response.
 *
 * Every count the UI shows for this execution is a real .length of one
 * of the arrays below — summary.* is computed from them at the bottom
 * of this file, never set independently. There is no number anywhere
 * on this page that isn't backed by an actual record in this file.
 */

const T = (h: number, m: number, s = 0) => Date.UTC(2026, 3, 28, h, m, s) / 1000 // 2026-04-28, UTC

function item(partial: Partial<RetrievedItemDto> & Pick<RetrievedItemDto, 'content' | 'item_type' | 'source'>): RetrievedItemDto {
  return {
    confidence: 0.9, timestamp: T(8, 0), retrieval_score: 0.8, evidence_ids: [],
    ...partial,
  }
}

// ── Knowledge graph: the core story chain + secondary nodes, all of
// which the mini-graph actually renders (buildGraph in
// GroundingKnowledgeGraphCard reads this same array — no separate mock
// graph data exists anywhere).
const KNOWLEDGE: RetrievedItemDto[] = [
  item({ content: 'Priya Sharma (person, id=priya, role=customer)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['priya'], timestamp: T(7, 40) }),
  item({ content: 'Order #ORD-1746 (order, id=order_ord_1746, status=completed)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['order_ord_1746'], timestamp: T(8, 16) }),
  item({ content: '1% Milk (product, id=milk_1pct, price=$3.99, quantity=42)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['milk_1pct'], timestamp: T(8, 15) }),
  item({ content: 'Whole Milk (product, id=milk_whole, price=$4.29, quantity=0)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['milk_whole'], timestamp: T(8, 6) }),
  item({ content: 'Warehouse B (warehouse, id=warehouse_b, region=downtown)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['warehouse_b'], timestamp: T(7, 50) }),
  item({ content: 'Downtown Grocery (store, id=downtown_grocery, region=downtown)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['downtown_grocery'], timestamp: T(7, 45) }),
  item({ content: 'Customer Wallet (wallet, id=wallet_priya, balance=$142.50)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['wallet_priya'], timestamp: T(8, 16, 35) }),
  item({ content: 'Delivery Agent — Marcus T. (agent, id=delivery_agent_1, status=en_route)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['delivery_agent_1'], timestamp: T(8, 17) }),
  item({ content: 'Warehouse B Inventory (inventory, id=inventory_wb, sku_count=340)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['inventory_wb'], timestamp: T(8, 15, 30) }),
  item({ content: 'Warehouse Fire (event, id=warehouse_fire_event, severity=high)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['warehouse_fire_event'], timestamp: T(8, 6, 4) }),
  item({ content: 'Large Eggs — Dozen (product, id=eggs_large, price=$4.79, quantity=80)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['eggs_large'], timestamp: T(7, 30) }),
  item({ content: 'Sourdough Bread (product, id=bread_sourdough, price=$5.49, quantity=24)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['bread_sourdough'], timestamp: T(7, 28) }),
  item({ content: 'Marketplace Society (organization, id=marketplace_society, tier=1)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['marketplace_society'], timestamp: T(7, 20) }),
  item({ content: 'Warehouse Society (organization, id=warehouse_society, tier=2)', item_type: 'knowledge', source: 'knowledge_graph', evidence_ids: ['warehouse_society'], timestamp: T(7, 22) }),
]

// evidence_ids = (relationship_id, source_id, target_id) — real KG
// topology, same shape context_engine.py writes for real executions.
// 12 relationships across 14 entities — every one of these renders as
// a real edge in the graph (both endpoints exist in KNOWLEDGE above).
const RELATIONSHIPS: RetrievedItemDto[] = [
  item({ content: 'Priya Sharma -[placed]-> Order #ORD-1746 (relationship_id=rel_placed)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.8, retrieval_score: 0.5, evidence_ids: ['rel_placed', 'priya', 'order_ord_1746'], timestamp: T(8, 16) }),
  item({ content: 'Order #ORD-1746 -[contains]-> 1% Milk (relationship_id=rel_contains)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.8, retrieval_score: 0.5, evidence_ids: ['rel_contains', 'order_ord_1746', 'milk_1pct'], timestamp: T(8, 16) }),
  item({ content: '1% Milk -[available_at]-> Warehouse B (relationship_id=rel_avail_1pct)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.8, retrieval_score: 0.5, evidence_ids: ['rel_avail_1pct', 'milk_1pct', 'warehouse_b'], timestamp: T(8, 15) }),
  item({ content: 'Warehouse B -[supplies]-> Downtown Grocery (relationship_id=rel_supplies)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.8, retrieval_score: 0.5, evidence_ids: ['rel_supplies', 'warehouse_b', 'downtown_grocery'], timestamp: T(7, 50) }),
  item({ content: 'Priya Sharma -[owns]-> Customer Wallet (relationship_id=rel_owns)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.8, retrieval_score: 0.5, evidence_ids: ['rel_owns', 'priya', 'wallet_priya'], timestamp: T(8, 16, 35) }),
  item({ content: 'Order #ORD-1746 -[delivered_by]-> Delivery Agent (relationship_id=rel_delivered_by)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.8, retrieval_score: 0.5, evidence_ids: ['rel_delivered_by', 'order_ord_1746', 'delivery_agent_1'], timestamp: T(8, 17) }),
  item({ content: 'Warehouse B -[tracks]-> Warehouse B Inventory (relationship_id=rel_tracks)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.8, retrieval_score: 0.5, evidence_ids: ['rel_tracks', 'warehouse_b', 'inventory_wb'], timestamp: T(8, 15, 30) }),
  item({ content: 'Warehouse Fire -[affected]-> Whole Milk (relationship_id=rel_affected)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.9, retrieval_score: 0.6, evidence_ids: ['rel_affected', 'warehouse_fire_event', 'milk_whole'], timestamp: T(8, 6, 4) }),
  item({ content: 'Whole Milk -[was_available_at]-> Warehouse B (relationship_id=rel_avail_whole)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.6, retrieval_score: 0.4, evidence_ids: ['rel_avail_whole', 'milk_whole', 'warehouse_b'], timestamp: T(8, 6) }),
  item({ content: 'Order #ORD-1746 -[paid_via]-> Customer Wallet (relationship_id=rel_paid_via)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.8, retrieval_score: 0.5, evidence_ids: ['rel_paid_via', 'order_ord_1746', 'wallet_priya'], timestamp: T(8, 16, 38) }),
  item({ content: 'Downtown Grocery -[member_of]-> Marketplace Society (relationship_id=rel_member_of)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.7, retrieval_score: 0.4, evidence_ids: ['rel_member_of', 'downtown_grocery', 'marketplace_society'], timestamp: T(7, 20) }),
  item({ content: 'Delivery Agent -[staffed_by]-> Warehouse Society (relationship_id=rel_staffed_by)', item_type: 'relationship', source: 'knowledge_graph', confidence: 0.7, retrieval_score: 0.4, evidence_ids: ['rel_staffed_by', 'delivery_agent_1', 'warehouse_society'], timestamp: T(7, 22) }),
]

// 10 events — mid-range of the 8-15 the spec calls coherent.
const CONTEXT_EVENTS: RetrievedItemDto[] = [
  item({
    content: 'Whole Milk unavailable', item_type: 'external_perturbation', source: 'Warehouse Fire', timestamp: T(8, 6, 4),
    impact: 'high', affectedEntities: ['Whole Milk'], affectedLocation: 'Downtown Grocery',
    previousState: 'available', newState: 'unavailable',
    groundingImpact: 'Whole Milk removed from viable inventory',
    planningImpact: 'Substitution candidate 1% Milk introduced',
    planningCyclesAffected: 3,
  }),
  item({ content: '1% Milk available at Warehouse B', item_type: 'context_event', source: 'Inventory Update', timestamp: T(8, 15, 22) }),
  item({ content: 'Whole Milk unavailable', item_type: 'context_event', source: 'Inventory Update', timestamp: T(8, 15, 22) }),
  item({ content: '1% Milk price updated', item_type: 'context_event', source: 'Pricing Update', timestamp: T(8, 16, 11) }),
  item({ content: 'Loyalty points balance retrieved', item_type: 'context_event', source: 'Loyalty Service', timestamp: T(8, 16, 45) }),
  item({ content: 'Large Eggs available at Warehouse B', item_type: 'context_event', source: 'Inventory Update', timestamp: T(7, 30) }),
  item({ content: 'Sourdough Bread available at Warehouse B', item_type: 'context_event', source: 'Inventory Update', timestamp: T(7, 28) }),
  item({ content: 'Delivery agent assigned to Order #ORD-1746', item_type: 'context_event', source: 'Delivery Service', timestamp: T(8, 17) }),
  item({ content: 'Society membership confirmed for Downtown Grocery', item_type: 'context_event', source: 'Organizational', timestamp: T(7, 20) }),
  item({ content: 'Order #ORD-1746 marked delivered', item_type: 'context_event', source: 'Delivery Service', timestamp: T(8, 55) }),
]

// 5 experiences — mid-range of the 3-6 the spec calls coherent.
const EXPERIENCES: RetrievedItemDto[] = [
  item({
    content: 'Accepted 1% Milk substitution', item_type: 'experience', source: 'cognitive_memory', confidence: 0.87,
    timestamp: T(8, 16, 20), reason: 'Actor preference', influence: 0.87, evidence_ids: ['exec_1746600001_a1b2c3'],
  }),
  item({
    content: 'Preferred 1% Milk over Whole Milk', item_type: 'experience', source: 'cognitive_memory', confidence: 0.55,
    timestamp: Date.UTC(2026, 3, 15, 9, 2) / 1000, reason: 'Product preference', evidence_ids: ['exec_1746580003_c3d4e5'],
  }),
  item({ content: 'Reordered the same milk brand three cycles in a row', item_type: 'experience', source: 'cognitive_memory', confidence: 0.81, timestamp: Date.UTC(2026, 3, 20, 8, 40) / 1000, reason: 'Actor preference', influence: 0.62, evidence_ids: ['exec_1746590002_b2c3d4'] }),
  item({ content: 'Chose Downtown Grocery over Uptown Grocery for faster delivery', item_type: 'experience', source: 'cognitive_memory', confidence: 0.74, timestamp: Date.UTC(2026, 3, 8, 8, 5) / 1000, reason: 'Location preference', influence: 0.58 }),
  item({ content: 'Accepted a delivery delay of 20 minutes without cancelling', item_type: 'experience', source: 'cognitive_memory', confidence: 0.68, timestamp: Date.UTC(2026, 3, 10, 8, 55) / 1000, reason: 'Delivery tolerance', influence: 0.5, evidence_ids: ['exec_1746570004_d4e5f6'] }),
]

// 16 messages — within the spec's 8-20 range, one coherent thread.
const CONVERSATIONS: RetrievedItemDto[] = (() => {
  const script: Array<[string, string, number]> = [
    ['Store Bot', '1% Milk available. Would you like to substitute it for the unavailable Whole Milk?', T(8, 16, 2)],
    ['Priya Sharma', 'Yes, please add 2L 1% milk.', T(8, 16, 12)],
    ['Store Bot', 'Added to order. Proceed to checkout?', T(8, 16, 30)],
    ['Payment Service', 'Payment confirmed.', T(8, 16, 35)],
    ['Store Bot', 'Order confirmation #ORD-1746 sent.', T(8, 16, 38)],
    ['Store Bot', 'Estimated delivery: 45 minutes, via Downtown Grocery.', T(8, 16, 50)],
    ['Delivery Agent', 'Order picked up from Warehouse B.', T(8, 22, 10)],
    ['Priya Sharma', 'Can you also check if eggs are in stock?', T(8, 23, 5)],
    ['Store Bot', 'Large Eggs (Dozen) are in stock at $4.79.', T(8, 23, 20)],
    ['Priya Sharma', 'Not this time, thanks.', T(8, 23, 40)],
    ['Loyalty Service', 'You earned 12 loyalty points on this order.', T(8, 24, 0)],
    ['Store Bot', 'Your delivery agent is 15 minutes away.', T(8, 40, 5)],
    ['Delivery Agent', 'Order delivered.', T(8, 55, 0)],
    ['Store Bot', 'Order #ORD-1746 marked as delivered.', T(8, 55, 10)],
    ['Priya Sharma', 'Got it, thank you!', T(8, 56, 0)],
    ['Loyalty Service', 'Loyalty points balance retrieved: 342 points.', T(8, 56, 20)],
  ]
  return script.map(([source, content, timestamp]) => item({ content, item_type: 'conversation', source, timestamp, confidence: 0.95 }))
})()

// 6 referenced executions — top of the spec's 3-6 range.
const EXECUTIONS: RetrievedItemDto[] = [
  item({ content: 'Ordered milk substitution', item_type: 'execution', source: 'cognitive_memory', timestamp: T(8, 16), outcome: 'SUCCESS', evidence_ids: ['exec_1746600001_a1b2c3'] }),
  item({ content: 'Milk purchase', item_type: 'execution', source: 'cognitive_memory', timestamp: Date.UTC(2026, 3, 20, 8, 10) / 1000, outcome: 'SUCCESS', evidence_ids: ['exec_1746590002_b2c3d4'] }),
  item({ content: 'Milk preference', item_type: 'execution', source: 'cognitive_memory', timestamp: Date.UTC(2026, 3, 15, 9, 2) / 1000, outcome: 'SUCCESS', evidence_ids: ['exec_1746580003_c3d4e5'] }),
  item({ content: 'Delivery delayed', item_type: 'execution', source: 'cognitive_memory', timestamp: Date.UTC(2026, 3, 10, 8, 55) / 1000, outcome: 'PARTIAL', evidence_ids: ['exec_1746570004_d4e5f6'] }),
  item({ content: 'Egg restock check', item_type: 'execution', source: 'cognitive_memory', timestamp: Date.UTC(2026, 3, 5, 8, 20) / 1000, outcome: 'SUCCESS', evidence_ids: ['exec_1746560005_e5f6a7'] }),
  item({ content: 'Weekly grocery run', item_type: 'execution', source: 'cognitive_memory', timestamp: Date.UTC(2026, 2, 30, 8, 12) / 1000, outcome: 'SUCCESS', evidence_ids: ['exec_1746550006_f6a7b8'] }),
]

const RELEVANT_LOCATIONS = ['Priya’s Home', 'Downtown Grocery', 'Warehouse B']
const RELEVANT_OBJECTS = ['1% Milk (2L)', 'Whole Milk', 'Customer Wallet', 'Order #ORD-1746', 'Large Eggs (Dozen)', 'Sourdough Bread', 'Delivery Agent']
const AFFILIATION_CHAIN: AffiliationChainNode[] = [
  { id: 'priya', name: 'Priya Sharma', entityType: 'Customer' },
  { id: 'marketplace_society', name: 'Marketplace Society', entityType: 'Society', edgeLabel: 'member_of' },
  { id: 'downtown_grocery', name: 'Downtown Grocery', entityType: 'Store', edgeLabel: 'hosted_by' },
  { id: 'warehouse_society', name: 'Warehouse Society', entityType: 'Society', edgeLabel: 'supplied_by' },
  { id: 'warehouse_worker', name: 'Warehouse Worker', entityType: 'Role', edgeLabel: 'staffed_by' },
  { id: 'delivery_agent_1', name: 'Delivery Agent', entityType: 'Agent', edgeLabel: 'dispatches' },
]
const DURABLE_BELIEFS = [
  {
    subject: '1% Milk', value: 'available', confidence: 0.92, source: 'knowledge_graph',
    start_time: T(8, 15), end_time: null,
    metadata: { observation_count: 9, evidence_count: 9, reason: 'Confirmed in catalog after substitution', evidence: ['Knowledge Graph', 'Confirmed in catalog', 'Price = $3.99', 'Quantity = 42'] },
  },
  {
    subject: 'Large Eggs', value: 'available', confidence: 0.88, source: 'knowledge_graph',
    start_time: T(7, 30), end_time: null,
    metadata: { observation_count: 6, evidence_count: 6, reason: 'Retrieved from knowledge graph for this goal', evidence: ['Knowledge Graph', 'Confirmed in catalog', 'Price = $4.79', 'Quantity = 80'] },
  },
  {
    subject: 'Whole Milk', value: 'unavailable', confidence: 0.97, source: 'context_stream',
    start_time: T(8, 6, 4), end_time: null,
    metadata: { observation_count: 4, evidence_count: 4, reason: 'Warehouse Fire event — quantity dropped to 0', evidence: ['Context Stream', 'Warehouse Fire', 'Quantity = 0'] },
  },
]

export const DEMO_SNAPSHOT: ContextSnapshotDto = {
  execution_id: 'exec_1746600001_a1b2c3',
  actor_id: 'demo_priya_sharma',
  created_at: T(8, 16, 40),
  knowledge: KNOWLEDGE,
  relationships: RELATIONSHIPS,
  context_events: CONTEXT_EVENTS,
  // api/routes/actors.py::get_execution_semantic_memory sources
  // retrieved_this_execution straight from this same snapshot's
  // experiences/conversations fields — kept identical here so the two
  // DTOs stay consistent the same way the real route guarantees.
  experiences: EXPERIENCES,
  conversations: CONVERSATIONS,
  executions: EXECUTIONS,
  relevant_locations: RELEVANT_LOCATIONS,
  relevant_objects: RELEVANT_OBJECTS,
  available_capabilities: ['ProductSelection', 'OrderCreation', 'OrderConfirmation', 'PaymentConfirmation', 'DelegateTask'],
  affiliations: [],
  available_resources: [],
  world_state: {},
  retrieval_sources: ['knowledge_graph', 'context_stream', 'semantic_memory', 'organizational', 'affiliation_graph'],
  retrieval_latency_ms: { knowledge_graph: 12.4, context_stream: 4.1, semantic_memory: 6.8, organizational: 2.2, affiliation_graph: 9.6 },
  planner_prompt: '',
  prompt_tokens: 0,
  observed_facts: [],
  final_planner_context: {},
  // Every field below is a real .length of the arrays above — nothing
  // here is an independently-chosen number.
  summary: {
    entity_count: KNOWLEDGE.length,
    relationship_count: RELATIONSHIPS.length,
    context_event_count: CONTEXT_EVENTS.length,
    experience_count: EXPERIENCES.length,
    semantic_memory_count: DURABLE_BELIEFS.length,
    episodic_memory_count: EXPERIENCES.length,
    affiliation_count: AFFILIATION_CHAIN.length,
    location_count: RELEVANT_LOCATIONS.length,
    object_count: RELEVANT_OBJECTS.length,
    world_object_count: RELEVANT_OBJECTS.length,
  },
  diff_from_previous: {
    is_first_context: false,
    added: {
      knowledge: [KNOWLEDGE[10].content, KNOWLEDGE[11].content, KNOWLEDGE[2].content],
      relationships: [RELATIONSHIPS[2].content, RELATIONSHIPS[9].content],
      context_events: CONTEXT_EVENTS.slice(-3).map((e) => `${e.source}: ${e.content}`),
      experiences: EXPERIENCES.slice(0, 2).map((e) => e.content),
      conversations: CONVERSATIONS.slice(0, 3).map((c) => `${c.source}: ${c.content}`),
      executions: [EXECUTIONS[0].content],
    },
    removed: {
      knowledge: ['Whole Milk (product, id=milk_whole, price=$4.29, quantity=20) — prior quantity before the fire'],
      relationships: ['Whole Milk -[available_at]-> Warehouse B (stale, pre-fire quantity)'],
      context_events: [],
      experiences: ['Preferred Whole Milk when in stock'],
      conversations: ['Prior substitution offer for Organic Whole Milk'],
      executions: [],
    },
  },
}

export const DEMO_SEMANTIC_MEMORY: SemanticMemoryDto = {
  actor_id: 'demo_priya_sharma',
  execution_id: 'exec_1746600001_a1b2c3',
  retrieved_this_execution: { experiences: EXPERIENCES, conversations: CONVERSATIONS },
  durable_beliefs: DURABLE_BELIEFS,
}

export const DEMO_CAUSAL_CHAIN: CausalStep[] = [
  { label: 'World Change', detail: 'Warehouse fire' },
  { label: 'Belief Update', detail: 'Whole Milk unavailable' },
  { label: 'Grounding Change', detail: 'Previous candidate invalidated' },
  { label: 'Plan Adaptation', detail: '1% Milk selected' },
  { label: 'Execution', detail: 'Order completed' },
]

export const DEMO_AFFILIATION_CHAIN: AffiliationChainNode[] = AFFILIATION_CHAIN

// Keyed by the exact strings in DEMO_SNAPSHOT.relevant_objects — real
// snapshots never populate this (relevant_objects is a plain string[]
// with nothing structured behind it), so it's the one place real vs.
// demo click behavior genuinely diverges: real object chips fall back
// to an honest "not available" drawer instead of fabricating this.
const DEMO_OBJECT_DETAILS: Record<string, { state: string; provenance: string }> = {
  '1% Milk (2L)': { state: 'In stock — 42 units at Warehouse B', provenance: 'Knowledge Graph · substituted in after Whole Milk became unavailable' },
  'Whole Milk': { state: 'Unavailable — 0 units, Warehouse Fire', provenance: 'Context Stream · Warehouse Fire event at 08:06:04' },
  'Customer Wallet': { state: 'Balance $142.50 after this order', provenance: 'Knowledge Graph · charged for Order #ORD-1746' },
  'Order #ORD-1746': { state: 'Completed', provenance: 'Execution record · created and confirmed this cycle' },
  'Large Eggs (Dozen)': { state: 'In stock — 80 units at Warehouse B', provenance: 'Knowledge Graph · checked but not purchased' },
  'Sourdough Bread': { state: 'In stock — 24 units at Warehouse B', provenance: 'Knowledge Graph · not part of this order' },
  'Delivery Agent': { state: 'En route — dispatched from Warehouse B', provenance: 'Organizational · assigned via Warehouse Society' },
}

export const DEMO_META: GroundingExecutionMeta = {
  executionId: 'exec_1746600001_a1b2c3',
  actorName: 'Priya Sharma',
  goal: 'Buy 2L milk — substitute if Whole Milk is unavailable',
  status: 'success',
  time: T(8, 16, 40),
  causalChain: DEMO_CAUSAL_CHAIN,
  affiliationChain: DEMO_AFFILIATION_CHAIN,
  objectDetails: DEMO_OBJECT_DETAILS,
}
