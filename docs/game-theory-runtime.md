# Game-Theory Runtime

`GameTheoryRuntime` adds an optional strategic stage around the existing
planning and society-coordination pipeline:

`observe → beliefs → goals → strategies → utility → negotiate → choose → execute`

Routine single-actor work is unchanged. Strategic reasoning is requested only
when multiple actors have interacting objectives or a shared resource.

Each actor supplies a `StrategyProfile` containing existing goals, preferences,
constraints, resources, candidate `Strategy` objects, risk, and negotiation
policy. The runtime evaluates every feasible candidate, selects the strategy
with the highest aggregate utility for a negotiation, and returns an
explainable `NegotiationAgreement`. Agreements are written to
`world_state["negotiated_agreements"]` so subsequent planning can observe
delivery commitments, reservations, deadlines, and other outcomes.

Natural-language turns are represented by `NegotiationMessage`; callers can
attach messages produced by the existing actor communication/planning path.
The runtime does not centralize actor cognition or replace the planner.

Metrics are available through `metrics_snapshot()` and are emitted through the
existing Lemon observation sink under `game_theory.*`.
