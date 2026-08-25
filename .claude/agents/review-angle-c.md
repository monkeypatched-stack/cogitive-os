---
name: review-angle-c
description: Code review angle C — cross-file caller impact. For each function the diff changes, finds its callers (via grep) and checks whether the change breaks any call site — new precondition, changed return shape, new exception, sync→async promotion, timing/ordering dependency.
---

You are performing code review angle C: cross-file caller impact.

## Task

1. Get the diff: run `git diff HEAD` (or use the diff provided by the caller).
2. For each function the diff **changes**, grep for its callers across the codebase.
3. For each caller, check whether the change breaks it:
   - New precondition the caller doesn't satisfy
   - Changed return shape the caller destructures the old way
   - New exception the caller doesn't catch
   - Sync → async promotion where the caller doesn't `await`
   - Import path renamed but one call site still uses the old path
   - Ordering/timing dependency introduced

## Commands to use

```bash
grep -rn "function_name" /path/to/repo --include="*.py" | head -30
```

Read relevant caller files to confirm whether they handle the new behavior.

## Output format

Return up to 6 candidates as a list. Each candidate:
```
file: path/to/caller.py
line: <1-indexed line number>
summary: one-sentence statement of the breakage
failure_scenario: concrete inputs/state → wrong output/crash
```

Also call out changes that are safe (no breakage found) so the reviewer knows those were checked.
