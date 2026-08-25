---
name: lint-and-test
description: "Run ruff lint on changed files then pytest on related tests. Use after code edits to validate before committing."
---

# Lint and Test Workflow

A repeatable workflow for validating code changes: lint first, then run targeted tests.

## When to use

After editing Python files in this project, run this workflow to catch issues before committing.

## Steps

### 1. Lint changed files with ruff

```bash
cd /Users/prashunjaveri/Code/monkeypatched && .venv/bin/python -m ruff check <FILES> 2>&1
```

- Use `--select F,E` to focus on fatal errors and logic errors.
- Use `--ignore F401,F821,F841` to suppress unused-import and similar warnings if needed.
- If no specific files are known, lint the entire service:
  ```bash
  .venv/bin/python -m ruff check services/ 2>&1 | head -30
  ```

### 2. Run targeted tests

```bash
cd /Users/prashunjaveri/Code/monkeypatched && .venv/bin/python -m pytest <TEST_FILES> -v 2>&1 | tail -20
```

- Run only the tests related to the changed files.
- Use `-x` to stop on first failure.
- Use `--tb=short` for concise tracebacks.

### 3. If tests pass, run the broader suite (optional)

```bash
cd /Users/prashunjaveri/Code/monkeypatched && .venv/bin/python -m pytest -v 2>&1 | tail -10
```

## Rules

- **Always lint before testing** — catch syntax/import errors first.
- **Do not touch the ontology** (`_ONTOLOGY` dict) per project MEMORY.md rule.
- **All fixes must be validated against the unseen test suite**, not just the 400-question adversarial suite.
