# Runtime governance — evaluated by GovernanceEngine.evaluate()
# (src/monkey_brain/kernel/governance.py), called from the /plan, /execute,
# /predict, /simulate, /compare, /learn, and /query route handlers before
# each request runs.
#
# Replaces the previous in-memory, Python-only stub: a per-process dict of
# RuntimeCharter objects that only ever got populated by register_charter(),
# which had zero callers anywhere in production — so real governance was
# never actually configurable at all, only ever "not configured" (allow
# everything) or, in an earlier version, "deny everything" (a fail-closed
# control with no provisioning path, which is an outage, not security — see
# tests/security/test_governance_gate.py). This moves the actual decision
# into OPA's data layer, which IS provisionable at runtime (PUT
# /v1/data/agentos/governance/{denied_runtimes,denied_actions,charters})
# without a code deploy.
#
# Input schema (supplied by GovernanceEngine.evaluate):
#   input.runtime_id  — string  (the authenticated caller/runtime id)
#   input.action      — string  ("plan" | "execute" | "simulate" | "compare"
#                                 | "learn" | "query")
#   input.context     — object  (request-specific: question text, run_id, ...)
#
# Data (pushed via OPA's data API or a bundle; all optional — absent data
# means "nothing has been configured to deny," which is the correct default
# for a system with no provisioning path yet):
#   data.agentos.governance.denied_runtimes  — [runtime_id, ...] full block
#   data.agentos.governance.denied_actions   — [action, ...] global kill-switch
#   data.agentos.governance.charters[runtime_id] — {
#       constitution: ["deny <action>", ...],
#       denied_actions: [action, ...],
#   } per-runtime rules, the direct successor of the old RuntimeCharter shape
#
# GovernanceEngine calls this with default_allow=True when OPA is
# unreachable/unconfigured (OPA_URL unset) — the client-side safety net that
# keeps this inert-by-default, same as every other OPA integration in this
# codebase (services.common.opa.evaluate_full's own default_allow param,
# require_opa's "falls back to allow when OPA is not configured").
# The policy itself still defaults to deny internally and only allows
# through explicit rules, so a MISCONFIGURED-but-reachable OPA fails closed
# rather than silently open.

package agentos.governance

import future.keywords.if
import future.keywords.in

default allow = false

# Global runtime block — a runtime_id anyone has explicitly blocked.
runtime_blocked if {
	input.runtime_id in data.agentos.governance.denied_runtimes
}

# Global action kill-switch — an action ops has explicitly disabled for
# everyone (e.g. "learn" during an incident, without touching the code).
action_blocked if {
	input.action in data.agentos.governance.denied_actions
}

# Per-runtime charter: a constitution rule naming this action as denied, or
# an explicit denied_actions list on the charter — the direct successor of
# GovernanceEngine's own old _check_rule/_check_policy logic, now data-driven.
charter := data.agentos.governance.charters[input.runtime_id]

charter_denies if {
	some rule in charter.constitution
	contains(lower(rule), "deny")
	contains(lower(rule), lower(input.action))
}

charter_denies if {
	input.action in charter.denied_actions
}

allow if {
	not runtime_blocked
	not action_blocked
	not charter_denies
}

# Structured deny reason for audit logs / the API's {"reason": ...} field.
deny_reason := "runtime_blocked" if {
	not allow
	runtime_blocked
}

deny_reason := "action_blocked" if {
	not allow
	not runtime_blocked
	action_blocked
}

deny_reason := sprintf("charter denies action %q", [input.action]) if {
	not allow
	not runtime_blocked
	not action_blocked
	charter_denies
}
