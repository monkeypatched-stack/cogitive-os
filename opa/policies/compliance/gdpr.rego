package compliance.gdpr

import future.keywords.if
import future.keywords.in

default allow = true

deny if {
    input.signals.has_pii == true
    not input.signals.lawful_basis
}

deny if {
    input.signals.cross_border_transfer == true
    not input.signals.adequacy_decision
}

deny if {
    input.signals.children_data == true
    not input.signals.parental_consent
}

allow if { not deny }
