package compliance.gxp

import future.keywords.if

default allow = true

deny if {
    input.signals.has_gxp_data == true
    not input.signals.records_attributable
}

deny if {
    input.signals.has_gxp_data == true
    not input.signals.records_contemporaneous
}

deny if {
    input.signals.has_gxp_data == true
    not input.signals.audit_trail_gxp
}

deny if {
    input.signals.has_gxp_data == true
    not input.signals.validation_protocol
}

deny if {
    input.signals.has_gxp_data == true
    not input.signals.quality_unit_oversight
}

allow if { not deny }
