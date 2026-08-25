package compliance.soc2

import future.keywords.if

default allow = true

deny if {
    input.signals.has_user_access == true
    not input.signals.mfa_enforced
}

deny if {
    input.signals.has_user_access == true
    not input.signals.access_provisioning_formal
}

deny if {
    input.signals.has_operations == true
    not input.signals.incident_response_plan
}

deny if {
    input.signals.has_systems == true
    not input.signals.change_management_process
}

deny if {
    input.signals.has_availability_commitment == true
    not input.signals.recovery_objectives_defined
}

allow if { not deny }
