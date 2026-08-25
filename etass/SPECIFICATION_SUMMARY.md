# ETASS Specification — Summary and Status

## Documentation Map

| Book | File | Status | Notes |
|------|------|--------|-------|
| Book 1 — Foundations | docs/book1-foundations/01-vision-mission.md | Complete | Vision, mission, architecture, SDD methodology |
| Book 2 — SOMA Language | docs/book2-soma/01-chart-specification.md | Complete | Chart.yaml spec, values, templates, profiles, constitutions |
| Book 3 — Compiler | docs/book3-compiler/01-architecture.md | Complete | 9-stage pipeline, AgentPrompt format, REST/SDK/CLI APIs |
| Book 4 — Runtime | docs/book4-runtime/01-execution-model.md | Complete | Create/Improve/Reconcile modes, scheduling, state machine, recovery |
| Book 5 — Agent Library | docs/book5-agents/01-cerebellum.md | Partial | Cerebellum only. Motor-cortex, Broca, verification agents not yet written. |
| Book 6 — Verification | — | Not started | Verification pipeline, testing agents, quality gates |
| Book 7 — Runtime Intelligence | docs/book7-runtime-intelligence/01-observability.md | Complete | Metrics, logging, tracing, evidence collection |
| Book 8 — Evolution | docs/book8-evolution/01-continuous-improvement.md | Complete | Closed-loop feedback, learning engine, governance |
| Book 9 — SDK | docs/book9-sdk/01-developer-toolkit.md | Complete | Python SDK, REST API, CLI, plugin system |
| Book 10 — Examples | docs/book10-examples/01-reference-implementations.md | Complete | 5 reference implementations |

## Prompt Templates

| Prompt | File | Status |
|--------|------|--------|
| Cerebellum planning | prompts/cerebellum/planning-prompt.yaml | Complete |
| Motor-cortex coding | prompts/motor-cortex/ | Not started |
| Broca documentation | prompts/broca/ | Not started |
| Verification agents | prompts/verification/ | Not started |

## Key Concepts

### Specification-Driven Development (SDD)

The seven-step cycle:

1. **Specify** — Author a SOMA chart defining components, dependencies, compliance, and SLAs
2. **Compile** — The prompt compiler transforms the chart into typed `AgentPrompt` documents
3. **Execute** — The runtime dispatches prompts to autonomous agents in dependency order
4. **Verify** — Verification agents validate generated artifacts against constitutions
5. **Deploy** — The runtime executes the deployment strategy (rolling, blue-green, canary)
6. **Observe** — The observability layer collects execution evidence and production telemetry
7. **Evolve** — The evolution runtime feeds evidence back into chart updates (with governance review)

### SOMA Chart Structure

```
my-chart/
├── Chart.yaml          # Metadata, version, dependencies, SLAs, compliance
├── values.yaml         # Default configuration values
├── templates/          # Jinja2 templates rendered at compile time
├── profiles/           # Environment-specific value overrides
├── constitutions/      # Governance rules enforced at compile and runtime
└── policies/           # Operational policies (scaling, backup, etc.)
```

### AgentPrompt Structure

Every compiled prompt has seven fields:

| Field | Purpose |
|-------|---------|
| `role` | Agent persona, expertise, and behavioral guardrails |
| `chain_of_thought` | Ordered reasoning steps before producing output |
| `constraints` | Hard rules that cannot be violated |
| `context` | Runtime values injected at compile time |
| `instructions` | Detailed task specification and output structure |
| `inputs` | Compiled chart data the agent operates on |
| `output_format` | Schema, format, and validation rules for the response |

### Agent Categories

| Category | Agents | Responsibility |
|----------|--------|---------------|
| Specification | Chart Loader, Registry Manager | Specification loading and dependency resolution |
| Planning | Cerebellum | Architecture design and execution planning |
| Engineering | Motor Cortex, Broca | Code generation and documentation |
| Version Control | Source Control, PR Manager | Repository management and review |
| Verification | Unit Tester, Integration Tester, Security Analyzer | Quality validation |
| Runtime | Monkey Brain, Introspection Engine | Observability and monitoring |
| Evolution | Architecture Review, Spec Updater | Continuous improvement |

## What Is Missing

- **Book 6 (Verification)**: Verification pipeline architecture, testing agent contracts,
  quality gate specification. This is a gap — the system cannot validate generated artifacts
  without this book.
- **Agent prompts for motor-cortex, broca, and verification agents**: Only the Cerebellum
  prompt template exists.
- **SOMA chart examples**: The `charts/` directory referenced in the README does not yet
  contain example charts.
- **JSON schemas**: `schemas/cerebellum-output-schema.json` and peer schemas are referenced
  but not yet defined.
