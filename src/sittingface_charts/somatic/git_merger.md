# git_merger

## Capability: git_merger
- **ID:** cap-pipeline-merge-001
- **Platform:** Pipeline/Git
- **Version:** 1.0.0
- **Status:** active
- **Description:** Merges approved PRs into main via OpenClaw/n8n
- **Module:** Cerebellum
- **Tags:** pipeline, git, merge

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/git_merger`
- **Protocol:** http

### Operations
- **merge** (POST): Merge a PR

### Test Scenarios
- happy_path
- timeout
- error
