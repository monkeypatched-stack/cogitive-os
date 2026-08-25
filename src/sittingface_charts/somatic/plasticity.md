# plasticity

## Module: plasticity
- **Layer:** 5
- **Alias:** Learning + Testing + Seeding
- **Role:** Tests, synthetic data, continuous learning, evaluation
- **Owns:** SyntheticDataGeneration, DeterministicSeeding, ScenarioGeneration, EventGeneration, PerformanceTesting, ContinuousLearning, FeedbackLoops, AutoEvaluation
- **Never Owns:** RuntimeExecution, ProductionPipelines, CapabilityLogic, GovernancePolicy

## Principle: plasticity-principle-1
> All seed data created via FastAPI APIs. Never direct database manipulation.

## Principle: plasticity-principle-2
> Same config always produces identical datasets.

## Principle: plasticity-principle-3
> RL implementation can evolve (UCB → PPO) without changing kernel API.

## Principle: plasticity-principle-4
> Seed data generated from existing Pydantic domain models. Never redefine schemas.

## Invariant: PLAST-INV-001
- **Rule:** no_direct_db_writes_in_seeding
- **Severity:** critical
- **Rationale:** plasticity/seed never writes directly to databases. Only via APIs.
- **Audit:** Verify: plasticity/seed never writes directly to databases. Only via APIs.
- **Rejection:** REJECTED — Seeder writes directly to database.

## Invariant: PLAST-INV-002
- **Rule:** rl_interface_stable
- **Severity:** critical
- **Rationale:** RL policy interface must not change monkey_brain/kernel API.
- **Audit:** Verify: RL policy interface must not change monkey_brain/kernel API.
- **Rejection:** REJECTED — RL change breaks kernel API.

## Invariant: PLAST-INV-003
- **Rule:** no_production_execution_in_testing
- **Severity:** high
- **Rationale:** plasticity/testing never executes production pipelines.
- **Audit:** Verify: plasticity/testing never executes production pipelines.
- **Rejection:** REJECTED — Testing module executes production pipelines.

## Prompt
**Preamble:** Module: plasticity — Tests, synthetic data, continuous learning, evaluation

**Chain of Thought:**
1. Assert: plasticity generates synthetic data and tests. It never executes production. — _PLAST-INV-003_ ⚠️ AUDIT GATE
2. Map plasticity/seed/ files to seeding pipeline stages.
3. Verify seeder.py calls FastAPI endpoints only. No direct DB access. — _PLAST-INV-001_ ⚠️ AUDIT GATE
4. Verify seed_data.py uses existing Pydantic models. No schema redefinition.
5. Verify scenario_builder.py covers all scenario profiles.
6. Design RL policy interface in alignment with monkey_brain/kernel/rl. — _PLAST-INV-002_ ⚠️ AUDIT GATE
7. Produce all seeding and testing deliverables.
8. Run constitutional review gate. ⚠️ AUDIT GATE

**Review Gate:** constitutional
- **Approved:** APPROVED — plasticity conforms to Learning + Testing Constitution v1.0.0
- **Rejected:** REJECTED — Seeder writes directly to database., REJECTED — RL change breaks kernel API., REJECTED — Testing executes production pipelines.
