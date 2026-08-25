# Execution-layer authorization for the cognitive runtime.
#
# Evaluated by GoalExecutor._authorize() (src/monkey_brain/kernel/plan/goals/
# executor.py) before any goal runs, but only when AGENTOS_OPA_ENFORCE is
# enabled. This is defense in depth behind the API edge's require_permission:
# a caller reaching the runtime by any other path is still gated here.
#
# Input schema (supplied by GoalExecutor._authorize):
#   input.principal.sub   — string  (authenticated caller id)
#   input.action          — string  (GoalType: create | update | delete |
#                                     query | qa_background)
#   input.resource        — string  (goal name / target)
#
# Data (loaded by the Policy Control Plane bundle, keyed by principal sub):
#   data.agentos.user_permissions[sub] — [ "execute:workload", ... ]
#
# Default deny: the client calls evaluate(..., default_allow=False) under
# enforcement, so an unreachable or unconfigured OPA already denies. This
# policy is the explicit-allow half.

package agentos.execute

import future.keywords.if
import future.keywords.in

default allow = false

# Actions that never mutate state — safe for any authenticated principal.
read_only_actions := {"query", "qa_background", "read", "list", "get"}

# Read-only goals: allowed as long as the caller is authenticated.
allow if {
	input.principal.sub != ""
	lower(input.action) in read_only_actions
}

# Mutating goals: the caller must hold the execute permission, resolved from
# role data OPA loads via the Policy Control Plane bundle.
allow if {
	input.principal.sub != ""
	perms := data.agentos.user_permissions[input.principal.sub]
	"execute:workload" in perms
}

# Structured deny reason for audit logs.
deny_reason := reason if {
	not allow
	input.principal.sub == ""
	reason := "unauthenticated principal"
}

deny_reason := reason if {
	not allow
	input.principal.sub != ""
	reason := sprintf("principal %q lacks execute:workload for action %q on %q", [input.principal.sub, input.action, input.resource])
}
