package compliance.iso27001

import future.keywords.if

default allow = true

deny if {
    input.signals.has_privileged_access == true
    not input.signals.mfa_enabled
}

deny if {
    input.signals.has_sensitive_data == true
    not input.signals.encryption_at_rest
}

deny if {
    input.signals.has_sensitive_data == true
    not input.signals.risk_assessment_current
}

deny if {
    input.signals.uses_suppliers == true
    not input.signals.supplier_assessment_done
}

allow if { not deny }
