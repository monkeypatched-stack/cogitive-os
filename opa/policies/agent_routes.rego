# Agent-called route authorization (ADR 0021 / authz plan p2-scope).
#
# Edge-level authorization for routes that agents call, layered on top of the
# execution-layer hook (GoalExecutor._authorize → agentos/execute/allow). A route
# gates on this via require_opa("agentos/routes/allow", action=..., resource=...) OR
# the human-safe require_scope() dependency (services.common.agent_auth) once the two
# auth paths are reconciled (see below).
#
# Input schema (supplied by require_opa._check):
#   input.principal.principal_type   — "user" | "agent" | "keycloak"
#   input.principal.scopes           — [ "execute:agent", "manage:agents", ... ]
#   input.principal.role_ids         — [...]
#   input.action                     — the route's action (execute | discover | view | ...)
#   input.resource                   — the route's resource (agent type / capability name)
#
# Default deny; require_opa is called with default_allow=True today (inert until
# OPA_URL is set), so this only bites once OPA is configured.

package agentos.routes

import future.keywords.if
import future.keywords.in

default allow = false

# Humans are authorized by the human RBAC layer (require_permission), not here —
# route-level agent scoping must never gate a human principal.
allow if {
	input.principal.principal_type != "agent"
}

# Read actions: any agent with a view scope.
read_actions := {"view", "list", "get", "search", "resolve", "graph"}

allow if {
	input.principal.principal_type == "agent"
	lower(input.action) in read_actions
	"view:agents" in input.principal.scopes
}

# Agent invocation (execute / execute-direct): requires the execute scope.
allow if {
	input.principal.principal_type == "agent"
	lower(input.action) == "execute"
	"execute:agent" in input.principal.scopes
}

# Agent management (discover / register): requires the manage scope.
allow if {
	input.principal.principal_type == "agent"
	lower(input.action) in {"discover", "manage", "register"}
	"manage:agents" in input.principal.scopes
}

# Structured deny reason for audit logs.
deny_reason := reason if {
	not allow
	input.principal.principal_type == "agent"
	reason := sprintf("agent %q lacks scope for action %q on %q", [input.principal.sub, input.action, input.resource])
}
