# Pipeline Guardrail — structural enforcement of the cognitive pipeline DAG.
#
# Evaluated by PolicyAgent (not Envoy). The PolicyAgent fetches the live Redis
# attestation record and passes it as input.pipeline_state, then sends the full
# input here for evaluation.
#
# Structural invariants enforced:
#   1. Pipeline must be in EXECUTING status (not COMPLETED, not expired)
#   2. The step encoded in the SPIFFE URI must equal the current active step
#   3. The requested capability must appear in allowed_capabilities[step_name]
#
# Input schema (supplied by PolicyAgent._opa_evaluate):
#   input.pipeline_id            — string
#   input.step_name              — string  (parsed from SPIFFE URI)
#   input.agent_role             — string  (parsed from SPIFFE URI)
#   input.requested_capability   — string  (resource or action)
#   input.pipeline_state         — object  (from Redis compiled_pipelines:{pipeline_id})
#     .status                    — "EXECUTING" | "COMPLETED"
#     .current_step              — string
#     .allowed_capabilities      — {step_name: [cap1, cap2, ...]}

package pipeline.guardrail

import future.keywords.if
import future.keywords.in

default allow = false

allow if {
    # 1. Pipeline is executing
    input.pipeline_state.status == "EXECUTING"

    # 2. The step in the SPIFFE URI matches the currently active step
    input.pipeline_state.current_step == input.step_name

    # 3. The requested capability is explicitly listed for this step
    input.requested_capability in input.pipeline_state.allowed_capabilities[input.step_name]
}

# Provide a structured deny reason for audit logs
deny_reason := reason if {
    not allow
    input.pipeline_state.status != "EXECUTING"
    reason := "pipeline_not_executing"
} else := reason if {
    not allow
    input.pipeline_state.current_step != input.step_name
    reason := sprintf(
        "step_mismatch:current=%v:token=%v",
        [input.pipeline_state.current_step, input.step_name],
    )
} else := reason if {
    not allow
    not input.requested_capability in input.pipeline_state.allowed_capabilities[input.step_name]
    reason := sprintf(
        "capability_not_allowed:cap=%v:step=%v",
        [input.requested_capability, input.step_name],
    )
} else := "guardrail_denied"
