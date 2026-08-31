import { useEffect, useState } from 'react'
import mermaid from 'mermaid'
import './ArchitectureDiagram.css'

// The canonical CognitiveOS architecture diagram — static, structural,
// and deliberately decoupled from runtime telemetry (LemonMetricsPanel's
// "Cognitive Loop" instrumentation view used to render this same shape as
// live-data cards; that view answers "what is CognitiveOS doing right
// now," this one answers "what CognitiveOS is" and must render identically
// whether or not the backend has produced a single tick). Verified against
// the real call graph this session (comparison/integration.py's
// ComparisonIntegratedPolicy.configure(), action_executor.py's
// TransitionGate evaluation, kernel/governance.py's API-boundary
// GovernanceEngine) — node/edge structure below is not invented.
const DIAGRAM_DEFINITION = `flowchart TD
    G[Goal] --> W[World State]
    W --> O[Observe]
    O --> B[Believe]
    B --> P[Plan]
    P --> PR[Predict]
    PR --> D[Decide]

    D -->|keep| E[Execute]
    D -->|stale / invalid| RP[Replan]
    RP --> P

    E --> TG[TransitionGate]
    TG -->|negotiation required| N[Negotiation]
    TG -->|no negotiation required| C[World Commit]
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

    classDef stage fill:#EEF2FF,stroke:#4338CA,stroke-width:1px,color:#1E293B
    classDef gate fill:#FAFAFF,stroke:#8B5CF6,stroke-width:1px,color:#1E293B
    classDef compare fill:#ECFDF5,stroke:#047857,stroke-width:1px,color:#1E293B
    classDef security fill:#FDF4FF,stroke:#A21CAF,stroke-width:2px,color:#1E293B

    class G,W,O,B,P,PR,D,RP,L,LT,NEXT stage
    class E,TG,N,C gate
    class OO,CMP compare
    class SEC security
`

let mermaidInitialized = false

// The canonical architecture diagram: pure structure, zero props, zero
// dependency on /observability — must render identically with no backend
// running at all (requirements 12/13 of the "replace with Mermaid" task).
export function ArchitectureDiagram() {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false, theme: 'neutral', securityLevel: 'strict', fontFamily: 'inherit',
        flowchart: { nodeSpacing: 55, rankSpacing: 75, curve: 'basis', padding: 12 },
      })
      mermaidInitialized = true
    }
    let cancelled = false
    mermaid.render('cognitive-os-architecture', DIAGRAM_DEFINITION)
      .then(({ svg: rendered }) => { if (!cancelled) setSvg(rendered) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [])

  if (error) return <div className="lwe-arch-error">⚠ Architecture diagram failed to render: {error}</div>
  if (!svg) return <div className="lwe-arch-loading">Rendering architecture diagram…</div>
  return <div className="lwe-arch-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
}
