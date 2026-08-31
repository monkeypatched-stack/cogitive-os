# CognitiveOS — Architecture and Sequence Diagrams

Visual reference for deployment topology, the cognitive loop, and key runtime flows.
Diagrams use [Mermaid](https://mermaid.js.org/). Syntax is kept compatible with
**GitHub's Mermaid renderer** (quoted labels, no `&` node chains, ASCII punctuation).

**Canonical sources:**

| Topic | Document |
|-------|----------|
| Deployment audit and target model | [`DEPLOYMENT_ARCHITECTURE.md`](../DEPLOYMENT_ARCHITECTURE.md) |
| Consolidated architecture | [`COGNITIVEOS_FINAL_ARCHITECTURE.md`](COGNITIVEOS_FINAL_ARCHITECTURE.md) |
| Runtime layering and pipeline | [`architecture.md`](architecture.md) |
| Actor lifecycle | [`ACTOR_LIFECYCLE.md`](ACTOR_LIFECYCLE.md) |
| Actor scheduler | [`ACTOR_SCHEDULER.md`](ACTOR_SCHEDULER.md) |
| Actor artifact and boot | [`ACTOR_ARTIFACT.md`](ACTOR_ARTIFACT.md) |
| Horizontal scaling | [`HORIZONTAL_SCHEDULER_SCALING.md`](HORIZONTAL_SCHEDULER_SCALING.md) |
| Interactive UI diagram | living-world-explorer, Architecture tab |

---

## Table of contents

1. [Cognitive loop](#1-cognitive-loop-per-actor-tick)
2. [API to Kernel to Persistence](#2-api-to-kernel-to-persistence)
3. [World interaction and security](#3-world-interaction-and-security-boundary)
4. [Docker Compose (local)](#4-docker-compose-local)
5. [Kubernetes](#5-kubernetes)
6. [Current vs target deployment](#6-current-vs-target-deployment)
7. [Control plane and actor artifact](#7-control-plane-and-actor-artifact)
8. [Horizontal scaling shape](#8-horizontal-scaling-shape)
9. [Sequence: POST /prompt (grocery)](#9-sequence-post-prompt-grocery-purchase)
10. [Sequence: UPI payment (two-phase)](#10-sequence-upi-payment-two-phase)
11. [Sequence: Actor identity at boot](#11-sequence-actor-identity-at-boot)
12. [Actor runtime startup](#12-actor-runtime-startup-state-machine)
13. [Sequence: Lifecycle reconciliation](#13-sequence-lifecycle-reconciliation)
14. [Sequence: Actor migration](#14-sequence-actor-migration)
15. [Sequence: Node failure recovery](#15-sequence-node-failure-reschedule)
16. [Sequence: Rolling artifact upgrade](#16-sequence-rolling-artifact-upgrade)
17. [Sequence: cogctl apply](#17-sequence-cogctl-apply)
18. [Actor lifecycle states](#18-actor-lifecycle-states)
19. [Geography vs Society](#geography-vs-society-structural-axes)

---

## 1. Cognitive loop (per-actor tick)

Stage order:
`observe -> believe -> plan -> predict -> decide -> execute -> observe_outcome -> compare -> learn -> learn_transitions -> compile_phi -> commit`

Inside **execute**, per action: `TransitionGate -> Negotiation (if required) -> Commit`.

```mermaid
flowchart TD
    G[Goal] --> W[World State]
    W --> O[Observe]
    O --> B[Believe]
    B --> P[Plan]
    P --> PR[Predict]
    PR --> D[Decide]

    D -->|keep| E[Execute]
    D -->|stale or invalid| RP[Replan]
    RP --> P

    E --> TG[TransitionGate]
    TG -->|negotiation required| N[Negotiation]
    TG -->|no negotiation| C[World Commit]
    N --> C

    C --> OO[Observe Outcome]
    OO --> CMP[Compare]
    CMP --> L[Learn]
    L --> LT[LearnTransitions]

    LT --> NEXT[Next Cognitive Cycle]
    NEXT --> O

    PR -.->|predicted outcome| CMP
    OO -.->|actual outcome| CMP

    SEC[Security and Policy] -.->|governs| E
    SEC -.->|governs| TG
    SEC -.->|governs| C
```

---

## 2. API to Kernel to Persistence

```mermaid
flowchart TB
    subgraph apiLayer["API layer port 8031"]
        PROMPT["POST /prompt"]
        ACTORS["/actors"]
        PAY["/payments"]
    end

    subgraph kernelLayer["Kernel"]
        PR["PlanetaryRuntime"]
        SR["SocietyRuntime"]
        PIPE["pipeline cognitive loop"]
        EXEC["ActionExecutor"]
        CAP["domains grocery finance"]
    end

    subgraph persistLayer["Persistence"]
        MONGO[("MongoDB belief")]
        REDIS[("Redis registry leases")]
        NEO[("Neo4j KnowledgeGraph")]
    end

    PROMPT --> PR
    PR --> SR
    SR --> PIPE
    PIPE --> EXEC
    EXEC --> CAP
    PR --> MONGO
    PR --> REDIS
    PR --> NEO
    CAP --> NEO
```

---

## 3. World interaction and security boundary

```mermaid
flowchart TB
    Actor["ACTOR"]
    Bus["SOCIETY BUS NATS and Redis inbox"]
    Cap["GOVERNED CAPABILITY"]
    Soc["SOCIETY"]
    WAPI["WORLD API and KnowledgeGraph"]
    Reality["REALITY orders payments inventory"]

    Actor --> Bus
    Actor --> Cap
    Bus --> Soc
    Cap --> WAPI
    WAPI --> Reality
```

---

## 4. Docker Compose (local)

```mermaid
flowchart TB
    subgraph clientsGrp["Clients"]
        UI["explorer cogctl curl"]
    end

    subgraph gatewayGrp["Gateway port 8000"]
        KONG["Kong API Gateway"]
    end

    subgraph controlGrp["Society Control Plane port 8031"]
        AGENTOS["agentos FastAPI PlanetaryRuntime"]
    end

    subgraph domainGrp["Manufacturing REST services"]
        AUTH["auth orders inventory"]
    end

    subgraph infraGrp["Shared infrastructure"]
        MONGO[("MongoDB")]
        REDIS[("Redis")]
        NEO[("Neo4j")]
        NATS[("NATS")]
        OPA[("OPA")]
    end

    subgraph actorsGrp["docker-compose.actors.yml optional"]
        A1["actor-a port 8051"]
        A2["actor-b port 8052"]
    end

    UI --> KONG
    KONG --> AGENTOS
    KONG --> AUTH
    AGENTOS --> MONGO
    AGENTOS --> REDIS
    AGENTOS --> NEO
    AGENTOS --> NATS
    AGENTOS --> OPA
    A1 --> MONGO
    A1 --> REDIS
    A1 --> NEO
    A1 --> NATS
    A2 --> MONGO
    A2 --> REDIS
    A2 --> NEO
    A2 --> NATS
    A1 -.->|depends on| AGENTOS
    A2 -.->|depends on| AGENTOS
```

**Bring up:**

```bash
docker compose up agentos
docker compose up kong
docker compose -f docker-compose.yml -f docker-compose.actors.yml up -d
```

---

## 5. Kubernetes

```mermaid
flowchart TB
    subgraph nsGrp["namespace monkeybrain"]
        KONG["kong port 8000"]
        AGENTOS["agentos replicas 1"]
        REDIS[("redis")]
        MONGO[("mongodb")]
        NEO[("neo4j")]
        NATS[("nats")]
        OPA[("opa")]
    end

    subgraph templatesGrp["Per-actor templates envsubst"]
        POD["actor-deployment.yaml"]
        EDGE["edge-actor-deployment.yaml legacy"]
    end

    EXT["Clients"] --> KONG
    KONG --> AGENTOS
    AGENTOS --> REDIS
    AGENTOS --> MONGO
    AGENTOS --> NEO
    AGENTOS --> NATS
    AGENTOS --> OPA
    POD --> REDIS
    POD --> MONGO
    POD --> NATS
```

**Per-actor deploy:**

```bash
ACTOR_ID=alice ACTOR_NODE_CLASS=cloud \
  envsubst < deploy/k8s/actor-deployment.yaml | kubectl apply -f -
```

---

## 6. Current vs target deployment

### Current (monolithic cloud plus optional edge pods)

```mermaid
flowchart TB
    subgraph cloudGrp["Cloud Process agentos replicas 1"]
        API["FastAPI"]
        PR["PlanetaryRuntime"]
        SR["SocietyRuntime"]
        ACTORS["_actors in-process"]
        A1["CognitiveActor Alice"]
        A2["CognitiveActor Bob"]
        API --> PR
        PR --> SR
        SR --> ACTORS
        ACTORS -.-> A1
        ACTORS -.-> A2
    end

    subgraph edgeGrp["Edge Pod optional"]
        ES["edge_server.py"]
        EA["EdgeActor tabular RL prototype"]
        ES --> EA
    end

    NATS[("NATS")]
    MONGO[("MongoDB")]
    NEO[("Neo4j")]
    REDIS[("Redis")]
    OPA[("OPA")]

    PR --> NATS
    PR --> MONGO
    PR --> NEO
    PR --> REDIS
    API --> OPA
    ES -->|POST sync| API
```

### Target (Actor as Pod, shared control plane)

```mermaid
flowchart TB
    subgraph cpGrp["CognitiveOS Control Plane"]
        REG["Actor Registry"]
        SCHED["Actor Scheduler"]
        CTRL["Lifecycle Controller"]
        GOV["Governance TransitionGate"]
    end

    subgraph swiGrp["Shared World Infrastructure"]
        SW["KnowledgeGraph Neo4j"]
        PERSIST["ActorStateStore Mongo"]
        FABRIC["NATS and Redis inbox"]
    end

    subgraph en1Grp["Execution Node Cloud"]
        ACTOR_A["Actor Alice"]
    end

    subgraph en2Grp["Execution Node Edge"]
        ACTOR_B["Actor Carol"]
    end

    CTRL -.->|reconciles| ACTOR_A
    CTRL -.->|reconciles| ACTOR_B
    SCHED -.->|places| ACTOR_A
    SCHED -.->|places| ACTOR_B
    REG -.->|tracks| ACTOR_A
    REG -.->|tracks| ACTOR_B
    ACTOR_A --> FABRIC
    ACTOR_B --> FABRIC
    ACTOR_A --> SW
    ACTOR_B --> SW
    ACTOR_A --> PERSIST
    ACTOR_B --> PERSIST
    ACTOR_A -.->|governed| GOV
    ACTOR_B -.->|governed| GOV
```

**Core mapping:** Actor is analogous to Pod. Identity must survive placement changes
(actor identity is not actor location).

---

## 7. Control plane and actor artifact

```mermaid
flowchart TB
    subgraph socGrp["COGNITIVEOS SOCIETY"]
        Reg["Registry"]
        Sched["Scheduler"]
        LC["Lifecycle Controller"]
    end

    Bus["Society Bus NATS and Redis"]
    Spec["Actor Specification"]
    Place["placement"]
    Cloud["CLOUD"]
    Edge["EDGE"]
    Device["DEVICE or ROBOT"]
    RT1["Actor Runtime"]
    RT2["Actor Runtime"]
    RT3["Actor Runtime"]
    ActA["Actor A"]
    ActB["Actor B"]
    ActC["Actor C"]

    Reg --> Bus
    Sched --> Bus
    LC --> Bus
    Bus --> Spec
    Spec --> Place
    Place --> Cloud
    Place --> Edge
    Place --> Device
    Cloud --> RT1
    Edge --> RT2
    Device --> RT3
    RT1 --> ActA
    RT2 --> ActB
    RT3 --> ActC
```

**One image, many placements:**

```mermaid
flowchart LR
    Art["ACTOR ARTIFACT agentos image"]
    D["Docker"]
    K["Kubernetes"]
    E["Edge"]
    RT["Runtime"]
    Same["SAME ACTOR MODEL CognitiveActor"]

    Art --> D
    Art --> K
    Art --> E
    D --> RT
    K --> RT
    E --> RT
    RT --> Same
```

**Kubernetes placement:**

```mermaid
flowchart LR
    Spec["ActorSpecification"] --> Sched["CognitiveOS Scheduler"]
    Sched --> K8s["Kubernetes"]
    K8s --> Pod["Pod"]
    Pod --> RT["Actor Runtime"]
    RT --> A["Actor"]
```

---

## 8. Horizontal scaling shape

```mermaid
flowchart TB
    SOC["SOCIETY"]
    CP["CONTROL PLANE Scheduler Lifecycle Registry"]
    BUS["SERVICE BUS NATS and Redis"]
    A["Actor A runtime Edge"]
    B["Actor B runtime Cloud"]
    N["Actor N runtime Robot"]

    SOC --> CP
    SOC --> BUS
    CP --> BUS
    BUS --> A
    BUS --> B
    BUS --> N
```

---

## 9. Sequence: POST /prompt (grocery purchase)

```mermaid
sequenceDiagram
    participant Client
    participant Kong
    participant API as agentos API
    participant PR as PlanetaryRuntime
    participant SR as SocietyRuntime
    participant Actor as CognitiveActor
    participant Loop as Cognitive Pipeline
    participant KG as Neo4j KG
    participant Redis as Redis
    participant Mongo as MongoDB

    Client->>Kong: POST /prompt buy milk
    Kong->>API: proxy with X-User-ID
    API->>PR: restore_actor_belief
    API->>PR: execute_actor_request
    PR->>Redis: acquire_actor_lease
    PR->>SR: tick_one_actor
    SR->>Actor: tick

    Actor->>Loop: observe believe plan
    Note over Loop: LLM planner
    Loop->>Loop: predict and decide
    Note over Loop: TransitionModel gate

    Loop->>KG: ProductSelection
    Loop->>KG: OrderCreation
    Loop->>KG: PaymentConfirmation
    Loop->>KG: Payment
    Loop->>KG: OrderConfirmation

    Loop->>Loop: compare learn commit
    Actor-->>SR: tick result
    SR-->>PR: actor result
    PR->>Mongo: checkpoint_actor_belief
    PR->>Redis: release_actor_lease
    API-->>Client: PromptResponse
```

**Local demo:** `scripts/run_clean_grocery_pass.py`

---

## 10. Sequence: UPI payment (two-phase)

```mermaid
sequenceDiagram
    participant Loop as Payment step
    participant KG as KnowledgeGraph
    participant PSP as RazorpayUPI
    participant Redis as PendingPayment
    participant Webhook as Webhook or dev-complete

    Loop->>KG: PaymentConfirmation
    Loop->>PSP: reserve funds
    PSP-->>Loop: reservation_id pending
    Loop->>Redis: save PendingPayment
    Loop-->>Loop: tick pauses awaiting approval

    Note over Webhook: UPI approval or dev-complete
    Webhook->>PSP: authorize and capture
    Webhook->>Redis: resolve pending payment
    Webhook->>Loop: resume execution

    Loop->>PSP: capture
    Loop->>KG: debit wallet credit store
    Loop-->>Loop: success
```

---

## 11. Sequence: Actor identity at boot

```mermaid
sequenceDiagram
    participant Op as Operator
    participant Bin as Actor Runtime
    participant Reg as Actor Registry

    Note over Op,Reg: actor_id already registered
    Op->>Bin: ACTOR_ID=alice run
    Bin->>Reg: locate_actor alice
    alt found
        Reg-->>Bin: ActorRegistryEntry
        Bin->>Bin: reconcile restore activate
        Note over Bin: same actor_id
    else not found
        Reg-->>Bin: None
        Bin->>Bin: NOT_FOUND refuse start
    end
```

---

## 12. Actor runtime startup (state machine)

```mermaid
flowchart TD
    A[process starts] --> B[load config]
    B --> C[register_self_as_node]
    C --> D{actor_id in Registry}
    D -->|no bootstrap| E[NOT_FOUND]
    D -->|bootstrap dev| F[register_actor]
    D -->|yes| G[lifecycle reconcile]
    F --> G
    G --> H{result}
    H -->|unschedulable| I[UNSCHEDULABLE]
    H -->|elsewhere| J[SCHEDULED_ELSEWHERE]
    H -->|resident ACTIVE| K[READY]
    K --> L[start_auto_tick]
```

| Endpoint | Meaning |
|----------|---------|
| `GET /live` | Process alive (liveness probe) |
| `GET /ready` | 503 unless READY (readiness probe) |
| `GET /status` | Full readiness and placement debug |
| `GET /artifact` | actor_id, version, node_id, node_class |

---

## 13. Sequence: Lifecycle reconciliation

```mermaid
sequenceDiagram
    participant Loop as Reconcile loop
    participant Ctrl as LifecycleController
    participant Reg as Actor Registry
    participant Lease as Actor Lease
    participant Runtime as Actor Runtime

    Loop->>Ctrl: reconcile_all
    loop each actor
        Ctrl->>Reg: get desired state
        Ctrl->>Reg: observe actor
        alt settled
            Ctrl-->>Loop: action none
        else action needed
            Ctrl->>Lease: acquire lease
            alt denied
                Ctrl-->>Loop: skipped lease held
            else granted
                Ctrl->>Runtime: start resume suspend recover
                Ctrl->>Reg: refresh status
                Ctrl->>Lease: release lease
            end
        end
    end
```

---

## 14. Sequence: Actor migration

```mermaid
sequenceDiagram
    participant Op as Operator
    participant Sched as ActorScheduler
    participant NodeA as Node A current
    participant Reg as Registry
    participant NodeB as Node B target

    Op->>Reg: set desired node B
    Sched->>Reg: reserve capacity B
    NodeA->>NodeA: checkpoint and SUSPEND
    Note over NodeA: desired_state stays RUNNING
    NodeB->>Reg: reconcile SUSPENDED on B
    NodeB->>NodeB: restore belief activate
    NodeB->>Reg: status ACTIVE on B
    Note over NodeA,NodeB: same actor_id
```

---

## 15. Sequence: Node failure reschedule

```mermaid
sequenceDiagram
    participant NodeA as Node A dies
    participant Reg as Registry
    participant NodeB as Node B survivor

    Note over NodeA: crash no clean shutdown
    Note over Reg: stale record no lease
    NodeB->>Reg: observe is_stale
    NodeB->>Reg: decide RECOVER
    NodeB->>Reg: schedule on Node B
    NodeB->>NodeB: restore belief activate
    Note over NodeB: same actor_id one entry
```

---

## 16. Sequence: Rolling artifact upgrade

```mermaid
sequenceDiagram
    participant V1 as Actor v1.4
    participant Ctrl as Lifecycle Controller
    participant V2 as Actor v1.5

    Note over V1: RUNNING
    V1->>Ctrl: checkpoint on SIGTERM
    V1->>Ctrl: deregister_node
    Note over V2: new pod same ACTOR_ID
    V2->>Ctrl: reconcile RESUME
    Ctrl->>V2: restore_actor_belief
    Note over V2: READY same state
```

---

## 17. Sequence: cogctl apply

```mermaid
sequenceDiagram
    participant Op as Operator
    participant Cog as cogctl
    participant API as actors apply API
    participant PR as PlanetaryRuntime
    participant Sched as ActorScheduler
    participant RT as Actor Runtime

    Op->>Cog: cogctl apply actor.yaml
    Cog->>API: ActorSpecification
    API->>PR: register or update
    API->>Sched: set placement
    API->>PR: enqueue reconcile
    API-->>Cog: accepted
    Note over RT: async reconcile to READY
```

---

## 18. Actor lifecycle states

```mermaid
stateDiagram-v2
    [*] --> CREATE
    CREATE --> SCHEDULE
    SCHEDULE --> START
    START --> READY
    READY --> RUNNING
    RUNNING --> SUSPEND
    SUSPEND --> RESUME
    RESUME --> RUNNING
    RUNNING --> RESTART
    RESTART --> START
    RUNNING --> TERMINATE
    SUSPEND --> TERMINATE
    TERMINATE --> [*]
```

---

## Geography vs Society (structural axes)

```mermaid
flowchart LR
    subgraph geoGrp["Geography where"]
        P[Planet] --> Co[Country] --> Ci[City] --> Sp[Space]
    end

    subgraph socGrp2["Society who governs"]
        Soc[Society] --> T[Team] --> Act[Actor]
    end

    Sp -.->|hosts| Soc
```

---

## OPA vs in-world governance

| Layer | Mechanism | Question answered |
|-------|-----------|-------------------|
| Infrastructure authZ | OPA | Who can call which API route? |
| In-world authority | TransitionGate and KG delegations | What may this actor do in the world? |

Kubernetes RBAC is not a substitute for in-world actor authority.
