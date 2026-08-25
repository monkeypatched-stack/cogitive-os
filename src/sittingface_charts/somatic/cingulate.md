# cingulate

## Module: cingulate
- **Layer:** 5
- **Alias:** Governance + Benchmark
- **Role:** Benchmarks, policy enforcement, governance
- **Owns:** ArchitecturalGovernance, PolicyRegistry, ComplianceValidation, BenchmarkExecution, ScenarioValidation, MetricsCollection, ReportGeneration, ConstitutionalAudit
- **Never Owns:** RuntimeExecution, CapabilityLogic, Planning, WorldModel

## Principle: cingulate-principle-1
> Review is constitutional not functional. Ask: does it conform? Not: does it compile?

## Principle: cingulate-principle-2
> Every benchmark executes against deterministic grounded data. Never dynamic.

## Principle: cingulate-principle-3
> Every benchmark produces reproducible results. Randomness is controlled.

## Invariant: CING-INV-001
- **Rule:** governance_never_executes
- **Severity:** critical
- **Rationale:** cingulate/governance never executes pipelines or capabilities.
- **Audit:** Verify: cingulate/governance never executes pipelines or capabilities.
- **Rejection:** REJECTED — governance module contains execution logic.

## Invariant: CING-INV-002
- **Rule:** benchmarks_use_ground_truth
- **Severity:** critical
- **Rationale:** Benchmarks never generate expected outputs dynamically during execution.
- **Audit:** Verify: Benchmarks never generate expected outputs dynamically during execution.
- **Rejection:** REJECTED — Benchmark uses dynamic expected outputs.

## Prompt
**Preamble:** Module: cingulate — Benchmarks, policy enforcement, governance

**Chain of Thought:**
1. Assert: cingulate is governance and benchmark. It audits. It never executes. — _CING-INV-001_ ⚠️ AUDIT GATE
2. Map governance/ files to constitutional review responsibilities.
3. Map benchmark/ files to validation pipeline stages.
4. Verify architecture_validator.py checks all global INV-* invariants.
5. Verify benchmark runner uses ground truth datasets only. — _CING-INV-002_ ⚠️ AUDIT GATE
6. Produce governance deliverables: ConformanceScore, Violations, Recommendations.
7. Produce benchmark deliverables: Runner, Validator, Reporter, CIIntegration.
8. Run constitutional review gate. ⚠️ AUDIT GATE

**Review Gate:** constitutional
- **Approved:** APPROVED — cingulate conforms to Governance + Benchmark Constitution v1.0.0
- **Rejected:** REJECTED — Governance module contains execution logic., REJECTED — Benchmark uses dynamic expected outputs.
