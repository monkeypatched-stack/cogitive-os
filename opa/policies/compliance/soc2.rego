package compliance.soc2

import future.keywords.if

# Deny by default. Unknown/missing identity or MFA is not authorization.
# Agent-supplied compliance signals never grant allow.

default allow := false

auth := object.get(input, "auth", {})

principal_ok if {
    auth.authenticated == true
    auth.token_valid == true
    is_string(auth.principal)
    count(auth.principal) > 0
}

mfa_ok if {
    auth.mfa_required == false
}

mfa_ok if {
    auth.mfa_required == true
    auth.mfa_status == "satisfied"
}

mfa_ok if {
    auth.principal_type == "service"
    auth.authenticated == true
}

action_ok if {
    is_string(input.action)
    count(input.action) > 0
}

allow if {
    principal_ok
    mfa_ok
    action_ok
}
