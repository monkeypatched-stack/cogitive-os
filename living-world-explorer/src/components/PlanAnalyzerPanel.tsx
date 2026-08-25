import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorldStore } from '../store/worldStore'
import { callPlan, callExecute, PlanApiError, type PlanResponseDto, type PlanErrorDto } from '../api/planClient'
import { buildPlanGraph, layoutPlanGraph, type PGNode, type PlanGraph } from '../graph/planGraph'
import './PlanAnalyzerPanel.css'

// ─── Plan Analyzer — a pre-execution window into the real planner ─────────
// PLAN ANALYZER = PLAN ONLY. "Analyze Plan" calls POST /plan (the real
// planner — kernel/api/routes/plan.py's own docstring: "Nothing is
// executed"). Nothing on this screen ever calls POST /prompt or invokes a
// capability/agent. "Execute This Plan" is the one explicit action that
// calls POST /execute, re-posting the exact stored /plan response — the
// server's own commit boundary, not a second execution path built here.
// Every field shown is real: node type is always literally "execution" in
// this backend today (no goal/observation/decision taxonomy exists), and no
// node carries purpose/inputs/outputs/world-requirements/per-node
// constraints — those are shown as "Not available" rather than invented.

type AnalyzeStatus = 'idle' | 'analyzing' | 'analyzed' | 'error'
type ExecuteStatus = 'idle' | 'executing' | 'executed' | 'error'

function nodeDependencies(node: PGNode): string {
  return node.dependsOn.length > 0 ? node.dependsOn.join(', ') : 'None (entry node)'
}

function RawDataBlock({ data }: { data: unknown }) {
  return <details className="lwe-pa-raw">
    <summary>Raw Data</summary>
    <pre>{JSON.stringify(data, null, 2)}</pre>
  </details>
}

export function PlanAnalyzerPanel() {
  const selectedActorId = useWorldStore((s) => s.selectedActorId)

  const [question, setQuestion] = useState('')
  const [analyzedQuestion, setAnalyzedQuestion] = useState<string | null>(null)
  const [status, setStatus] = useState<AnalyzeStatus>('idle')
  const [planResponse, setPlanResponse] = useState<PlanResponseDto | null>(null)
  const [planError, setPlanError] = useState<PlanErrorDto | null>(null)

  const [executeStatus, setExecuteStatus] = useState<ExecuteStatus>('idle')
  const [executeResult, setExecuteResult] = useState<Record<string, unknown> | null>(null)
  const [executeError, setExecuteError] = useState<string | null>(null)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 20, y: 20, scale: 1 })
  const [dims, setDims] = useState({ w: 900, h: 500 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const obs = new ResizeObserver(([e]) => { if (e) setDims({ w: e.contentRect.width, h: Math.max(360, e.contentRect.height) }) })
    obs.observe(canvasRef.current)
    return () => obs.disconnect()
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!selectedActorId || !question.trim() || status === 'analyzing') return
    setStatus('analyzing')
    setPlanError(null)
    setPlanResponse(null)
    setSelectedNodeId(null)
    setExecuteStatus('idle')
    setExecuteResult(null)
    setExecuteError(null)
    const q = question.trim()
    try {
      const result = await callPlan(selectedActorId, q)
      setPlanResponse(result)
      setAnalyzedQuestion(q)
      setStatus('analyzed')
    } catch (err) {
      if (err instanceof PlanApiError) {
        setPlanError(err.body)
      } else {
        setPlanError({ error: err instanceof Error ? err.message : String(err) })
      }
      setStatus('error')
    }
  }, [selectedActorId, question, status])

  const graph: PlanGraph | null = useMemo(() => (planResponse ? buildPlanGraph(planResponse.graph) : null), [planResponse])
  const layout = useMemo(() => (graph ? layoutPlanGraph(graph, dims.w) : null), [graph, dims.w])

  // A plan is only executable while it still matches the prompt it was
  // generated from — editing the prompt after analyzing invalidates it
  // immediately, rather than letting a stale plan be executed silently.
  const planIsCurrent = status === 'analyzed' && planResponse !== null && analyzedQuestion === question.trim()

  const handleExecute = useCallback(async () => {
    if (!selectedActorId || !planResponse || !planIsCurrent || executeStatus === 'executing') return
    setExecuteStatus('executing')
    setExecuteError(null)
    setExecuteResult(null)
    try {
      const result = await callExecute(selectedActorId, planResponse)
      setExecuteResult(result)
      setExecuteStatus('executed')
    } catch (err) {
      setExecuteError(err instanceof PlanApiError ? (err.body.error || err.message) : (err instanceof Error ? err.message : String(err)))
      setExecuteStatus('error')
    }
  }, [selectedActorId, planResponse, planIsCurrent, executeStatus])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setTransform((t) => ({ ...t, scale: Math.min(3, Math.max(0.15, t.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) }))
  }, [])
  const onMouseDown = useCallback((e: React.MouseEvent) => { if (e.button !== 0) return; dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY } }, [])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x; const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])
  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  const neighborIds = useMemo(() => {
    const active = hoveredNodeId ?? selectedNodeId
    if (!active || !graph) return null
    const s = new Set<string>([active])
    for (const e of graph.edges) { if (e.source === active) s.add(e.target); if (e.target === active) s.add(e.source) }
    return s
  }, [hoveredNodeId, selectedNodeId, graph])

  const selectedNode = graph?.nodes.find((n) => n.id === selectedNodeId) ?? null
  const goalIr = planResponse?.graph.goal_ir
  const grounding = planResponse?.metadata?.grounding

  if (!selectedActorId) {
    return <div className="lwe-pa-page">
      <div className="lwe-inspector-muted" style={{ padding: 12 }}>
        Select an actor (World Tree — BY ACTOR, or the Map) to analyze a plan as that actor.
      </div>
    </div>
  }

  return (
    <div className="lwe-pa-page">
      <div className="lwe-pa-heading">
        <div>
          <h2>Plan Analyzer</h2>
          <p>Pre-execution execution-plan inspection — generates the real ExecutionGraph the runtime would use for this prompt (POST /plan, the same planner as execution), without executing anything.</p>
        </div>
        {graph && <span className="lwe-pa-heading-meta">
          {graph.nodes.length} node{graph.nodes.length === 1 ? '' : 's'} · {graph.edges.length} dependenc{graph.edges.length === 1 ? 'y' : 'ies'} · {graph.layers.length} layer{graph.layers.length === 1 ? '' : 's'}
        </span>}
      </div>

      <div className="lwe-pa-input-card">
        <textarea
          className="lwe-pa-textarea"
          placeholder="e.g. Buy 2 liters of milk"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="lwe-pa-input-row">
          <span className="lwe-pa-actor-hint">Analyzing as the selected actor</span>
          <button type="button" className="lwe-pa-btn" disabled={!question.trim() || status === 'analyzing'} onClick={handleAnalyze}>
            {status === 'analyzing' ? 'Analyzing…' : 'Analyze Plan'}
          </button>
        </div>
      </div>

      {status === 'analyzing' && (
        <div className="lwe-pa-analyzing"><div className="lwe-pa-spinner" /><span>Generating execution plan…</span></div>
      )}

      {status === 'error' && planError && (
        <div className="lwe-pa-error">
          {planError.error === 'planner_produced_no_graph' && <>
            <strong>Plan generation failed.</strong>
            <span>The planner produced no execution graph for this prompt.{typeof planError.detail === 'string' && planError.detail ? ` ${planError.detail}` : ''}</span>
          </>}
          {planError.error === 'Graph validation failed after repair attempts' && <>
            <strong>Plan generated but failed validation.</strong>
            <span>{planError.attempts != null ? `Failed after ${planError.attempts} repair attempt${planError.attempts === 1 ? '' : 's'}.` : ''}</span>
            {planError.errors && planError.errors.length > 0 && <ul>
              {planError.errors.map((e, i) => <li key={i}><code>{e.code}</code> — {e.message}</li>)}
            </ul>}
          </>}
          {planError.error !== 'planner_produced_no_graph' && planError.error !== 'Graph validation failed after repair attempts' && <>
            <strong>Plan generation failed.</strong>
            <span>{planError.error}</span>
          </>}
        </div>
      )}

      {status === 'idle' && (
        <div className="lwe-pa-empty">
          <p>No plan analyzed yet.<br />Enter a prompt above and click Analyze Plan to inspect its execution plan.</p>
        </div>
      )}

      {planResponse && graph && layout && (
        <>
          {grounding && grounding.low_grounding && (
            <div className="lwe-pa-warning">
              ⚠ Plan has warnings — grounding confidence {grounding.confidence.toFixed(2)} is below the {grounding.threshold.toFixed(2)} threshold. {grounding.remediation || 'No remediation suggested.'}
            </div>
          )}

          <dl className="lwe-pa-goal-card">
            <div className="lwe-pa-goal-field">
              <dt>Intent</dt>
              <dd>{goalIr?.intent_type ? <span className="lwe-pa-badge">{goalIr.intent_type.toUpperCase()}</span> : 'Not resolved'}</dd>
            </div>
            <div className="lwe-pa-goal-field">
              <dt>Goal</dt>
              <dd>{goalIr?.goal || 'Not resolved'}</dd>
            </div>
            <div className="lwe-pa-goal-field">
              <dt>Status</dt>
              <dd>✓ Valid plan</dd>
            </div>
            <div className="lwe-pa-goal-field">
              <dt>Elapsed</dt>
              <dd>{planResponse.elapsed_ms.toFixed(0)}ms</dd>
            </div>
          </dl>

          <div className="lwe-pa-graph-card">
            <div className="lwe-pa-canvas" ref={canvasRef} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
              <svg className="lwe-pa-svg" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet">
                <defs>
                  <marker id="pa-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 Z" fill="#C7CDD9" /></marker>
                  <filter id="pa-card-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.08" /></filter>
                </defs>
                <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
                  {graph.edges.map((edge) => {
                    const sp = layout.positions.get(edge.source); const tp = layout.positions.get(edge.target)
                    if (!sp || !tp) return null
                    const active = neighborIds ? neighborIds.has(edge.source) && neighborIds.has(edge.target) : false
                    const dimmed = neighborIds != null && !active
                    const x1 = sp.x + sp.w / 2, y1 = sp.y + sp.h
                    const x2 = tp.x + tp.w / 2, y2 = tp.y
                    const my = (y1 + y2) / 2
                    return <path key={edge.id} className="lwe-pa-edge" d={`M ${x1} ${y1} C ${x1} ${my} ${x2} ${my} ${x2} ${y2}`}
                      markerEnd="url(#pa-arrow)" style={{ opacity: dimmed ? 0.12 : active ? 1 : 0.45 }} />
                  })}
                  {graph.nodes.map((n) => {
                    const pos = layout.positions.get(n.id)
                    if (!pos) return null
                    const isActive = neighborIds ? neighborIds.has(n.id) : true
                    const isSelected = selectedNodeId === n.id
                    return (
                      <g key={n.id} className={`lwe-pa-node${isSelected ? ' is-selected' : ''}`}
                        transform={`translate(${pos.x},${pos.y})`} style={{ opacity: isActive ? 1 : 0.3 }}
                        tabIndex={0} role="button" aria-label={n.name}
                        onMouseEnter={() => setHoveredNodeId(n.id)} onMouseLeave={() => setHoveredNodeId(null)}
                        onClick={() => setSelectedNodeId((cur) => (cur === n.id ? null : n.id))}
                        onKeyDown={(e) => { if (e.key === 'Enter') setSelectedNodeId((cur) => (cur === n.id ? null : n.id)) }}
                      >
                        <rect className="lwe-pa-node-card" width={pos.w} height={pos.h} rx={12}
                          fill="#EEF2FF" stroke={isSelected ? '#4338CA' : '#C7D2FE'} strokeWidth={isSelected ? 2 : 1} filter="url(#pa-card-shadow)" />
                        <text className="lwe-pa-node-name" x={12} y={24}>{n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}</text>
                        <text className="lwe-pa-node-sub" x={12} y={42}>{n.agent || 'agent not resolved'}</text>
                        <text className="lwe-pa-node-sub" x={12} y={56}>{n.dependsOn.length > 0 ? `depends on ${n.dependsOn.length}` : 'entry node'}</text>
                      </g>
                    )
                  })}
                </g>
              </svg>
            </div>

            {selectedNode && (
              <aside className="lwe-pa-inspector">
                <div className="lwe-pa-inspector-header">
                  <div>
                    <span className="lwe-pa-inspector-badge">{selectedNode.type || 'execution'}</span>
                    <h3>{selectedNode.name}</h3>
                  </div>
                  <button type="button" className="lwe-pa-inspector-close" onClick={() => setSelectedNodeId(null)} aria-label="Close inspector">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
                <div className="lwe-pa-inspector-body">
                  <div className="lwe-pa-inspector-section-title">Node</div>
                  <dl className="lwe-inspector-fields">
                    <div><dt>ID</dt><dd>{selectedNode.id}</dd></div>
                    <div><dt>Type</dt><dd>{selectedNode.type || 'Not available'}</dd></div>
                    <div><dt>Status</dt><dd>Planned (not executed)</dd></div>
                  </dl>

                  <div className="lwe-pa-inspector-section-title">Purpose</div>
                  <div className="lwe-inspector-muted">Not available — this backend does not attach a purpose string to individual plan nodes.</div>

                  <div className="lwe-pa-inspector-section-title">Dependencies</div>
                  <div>{nodeDependencies(selectedNode)}</div>

                  <div className="lwe-pa-inspector-section-title">Inputs</div>
                  <div className="lwe-inspector-muted">Not available.</div>

                  <div className="lwe-pa-inspector-section-title">Outputs</div>
                  <div className="lwe-inspector-muted">Not available.</div>

                  <div className="lwe-pa-inspector-section-title">Capability</div>
                  <div className="lwe-inspector-muted">Not resolved — no field distinct from Agent exists for this node.</div>

                  <div className="lwe-pa-inspector-section-title">Agent</div>
                  <div>{selectedNode.agent || 'Not resolved'}</div>
                  {selectedNode.agents.length > 0 && <div className="lwe-inspector-hint">Additional agents: {selectedNode.agents.join(', ')}</div>}

                  <div className="lwe-pa-inspector-section-title">World Requirements</div>
                  <div className="lwe-inspector-muted">Not available.</div>

                  <div className="lwe-pa-inspector-section-title">Constraints</div>
                  <div className="lwe-inspector-muted">Not available at the node level — see plan-level constraints above the graph.</div>

                  <div className="lwe-pa-inspector-section-title">Validation</div>
                  <div>Valid — part of a plan that passed graph validation.</div>

                  <RawDataBlock data={selectedNode} />
                </div>
              </aside>
            )}
          </div>

          {(goalIr?.entities?.length || goalIr?.constraints?.length || goalIr?.goal_tree?.length) ? (
            <details className="lwe-pa-raw">
              <summary>Goal Detail (entities, constraints, goal tree)</summary>
              <pre>{JSON.stringify({ entities: goalIr?.entities, constraints: goalIr?.constraints, goal_tree: goalIr?.goal_tree }, null, 2)}</pre>
            </details>
          ) : null}

          <div className="lwe-pa-execute-bar">
            <span className="lwe-pa-execute-note">
              {planIsCurrent
                ? 'Executing will pass this exact analyzed plan into the real execution pipeline (POST /execute).'
                : 'Prompt changed since this plan was analyzed — re-analyze before executing.'}
            </span>
            <button type="button" className="lwe-pa-btn lwe-pa-btn-execute" disabled={!planIsCurrent || executeStatus === 'executing'} onClick={handleExecute}>
              {executeStatus === 'executing' ? 'Executing…' : 'Execute This Plan'}
            </button>
          </div>

          {executeStatus === 'executed' && executeResult && (
            <div className="lwe-pa-execute-result">
              <strong>Execution complete.</strong> {typeof executeResult.success === 'boolean' ? (executeResult.success ? 'Succeeded.' : 'Completed with failures.') : ''}
              {' '}This execution is now visible in the actor's Timeline/Debugger.
              <RawDataBlock data={executeResult} />
            </div>
          )}
          {executeStatus === 'error' && executeError && (
            <div className="lwe-pa-execute-result is-error">
              <strong>Execution failed.</strong> {executeError}
            </div>
          )}

          <RawDataBlock data={planResponse.graph} />
        </>
      )}
    </div>
  )
}
