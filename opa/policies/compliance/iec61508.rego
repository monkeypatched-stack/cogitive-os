package compliance.iec61508

import future.keywords.if

default allow = true

deny if {
    input.signals.has_safety_function == true
    not input.signals.hazard_analysis_done
}

deny if {
    input.signals.has_safety_function == true
    not input.signals.sil_assessment_performed
}

deny if {
    input.signals.has_safety_function == true
    not input.signals.sil_achieved_verified
}

deny if {
    input.signals.has_safety_function == true
    not input.signals.functional_safety_audit
}

deny if {
    input.signals.has_safety_function == true
    not input.signals.systematic_capability
}

deny if {
    input.signals.has_safety_function == true
    not input.signals.software_safety_lifecycle
}

allow if { not deny }
