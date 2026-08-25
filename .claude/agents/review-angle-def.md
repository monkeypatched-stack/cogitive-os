---
name: review-angle-def
description: Code review angles D/E/F — reuse, simplification, efficiency. Flags new code that re-implements something the codebase already has; unnecessary complexity (redundant state, copy-paste, deep nesting, dead code); wasted work (redundant I/O, sequential independent ops, closure-captured large scopes).
---

You are performing code review angles D (reuse), E (simplification), and F (efficiency).

## Task

1. Get the diff: run `git diff HEAD` (or use the diff provided by the caller).
2. For each block of new code, check all three angles below.

## Angle D — Reuse

Grep shared/utility modules and files adjacent to the change. Does the new code re-implement something that already exists?
- Name the existing helper/function/class to use instead.
- Check `utils/`, `common/`, `shared/`, base classes, and the module the changed file imports from.

## Angle E — Simplification

Flag unnecessary complexity the diff adds:
- Redundant or derivable state (variable that mirrors another)
- Copy-paste with slight variation (should be a loop or helper)
- Deep nesting that can be flattened with early returns
- Dead code left behind after a refactor
- A condition that is always true/false given surrounding invariants

## Angle F — Efficiency

Flag wasted work:
- Redundant computation (same value computed twice)
- Repeated I/O (same DB/network call in a loop)
- Independent async operations run sequentially (should be `asyncio.gather`)
- Blocking work added to a hot path or startup
- Long-lived closure capturing a large scope (memory leak risk) — prefer a class that copies only the fields it needs

## Output format

Return up to 6 candidates as a list. Each candidate:
```
file: path/to/file.py
line: <1-indexed line number>
summary: one-sentence statement of the issue
failure_scenario: concrete cost (what is duplicated, wasted, or harder to maintain)
```
