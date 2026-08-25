"""Test-only runtime scaffolding — never imported by production call paths
for their own sake, only wired in as inert, opt-in hooks (see
mutation_hooks.py) that existing production code already has a precedent
for (ActionExecutor.failure_rate)."""
