package compliance.fda

import future.keywords.if

default allow = true

deny if {
    input.signals.uses_electronic_records == true
    not input.signals.audit_trail_enabled
}

deny if {
    input.signals.uses_electronic_records == true
    not input.signals.system_validated
}

deny if {
    input.signals.is_medical_device == true
    not input.signals.quality_management_system
}

deny if {
    input.signals.is_medical_device == true
    not input.signals.design_controls_documented
}

deny if {
    input.signals.is_medical_device == true
    not input.signals.capa_process_active
}

allow if { not deny }
