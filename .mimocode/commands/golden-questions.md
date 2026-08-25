---
description: "Run the 400-question golden test suite and show summary. Usage: $ARGUMENTS (optional config file path)"
---

# Golden Questions Runner

Run the full accuracy test suite against the agentos query endpoint.

## Steps

1. Run the golden questions script with summary output:
   ```bash
   cd /Users/prashunjaveri/Code/monkeypatched && .venv/bin/python3 scripts/run_golden_questions.py $CONFIG 2>&1 | grep -E "SUMMARY|FAILURES BY CATEGORY|^  \w+ \("
   ```

2. If failures are found, inspect the specific failing questions and their categories to identify routing or answer issues.

## Parameters

- `$1` or `$ARGUMENTS`: Config JSON file path (default: `config/sentinel_x_golden_questions_ahmedabad.json`)

## Notes

- Timeout: 600 seconds (10 minutes) — the suite makes ~400 HTTP calls.
- The output is grep-filtered to show only the SUMMARY and FAILURES BY CATEGORY sections.
- For detailed failure output, remove the `grep` pipe.
