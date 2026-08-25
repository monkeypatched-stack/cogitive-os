package compliance.iso10218

import future.keywords.if

default allow = true

deny if {
    input.signals.has_industrial_robot == true
    not input.signals.risk_assessment_completed
}

deny if {
    input.signals.has_industrial_robot == true
    not input.signals.emergency_stop_cat0_or_1
}

deny if {
    input.signals.has_industrial_robot == true
    not input.signals.safeguarding_devices
}

deny if {
    input.signals.has_industrial_robot == true
    not input.signals.safety_assessment_completed
}

deny if {
    input.signals.has_industrial_robot == true
    not input.signals.control_system_safety_rated
}

deny if {
    input.signals.collaborative_operation == true
    not input.signals.speed_power_force_limited
}

deny if {
    input.signals.collaborative_operation == true
    not input.signals.safety_rated_monitored_stop
}

allow if { not deny }
