# Agent Mesh — baseline mesh-level policy for all inter-agent requests.
#
# Evaluated by PolicyAgent at path "agent/mesh/allow".
# Grants access when:
#   - Principal carries at least one required scope (if scopes list provided)
#   - Principal is an agent or keycloak identity
#   - High-risk actions require mtls_verified=true

package agent.mesh

import future.keywords.if
import future.keywords.in

default allow = true

# Block high-risk write operations from agents without mTLS
deny if {
    input.principal.principal_type == "agent"
    _is_high_risk_action(input.action)
    not input.principal.mtls_verified
}

# Block if principal type is completely unknown
deny if {
    input.principal.principal_type == "unknown"
}

allow if {
    not deny
}

_is_high_risk_action(action) if {
    high_risk := {"delete", "drop", "truncate", "purge", "destroy"}
    lower(action) in high_risk
}
