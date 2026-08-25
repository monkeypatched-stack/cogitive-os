# source_control

## Capability: source_control
- **ID:** cap-scm-001
- **Platform:** SourceControl/Git
- **Version:** 1.0.0
- **Status:** active
- **Description:** Source control integration (GitHub, GitLab, Bitbucket)
- **Module:** Cerebellum
- **Tags:** source-control, git, github

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/source_control`
- **Protocol:** http

### Operations
- **list_repos** (READ): List repositories
- **create_pr** (CREATE): Create a pull request

### Test Scenarios
- happy_path
- timeout
- error
