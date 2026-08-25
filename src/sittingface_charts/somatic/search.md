# search

## Capability: search
- **ID:** cap-search-001
- **Platform:** Search/Web
- **Version:** 1.0.0
- **Status:** active
- **Description:** Web search and document search capabilities
- **Module:** Cerebellum
- **Tags:** search, web, document

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/search`
- **Protocol:** http

### Operations
- **web_search** (READ): Search the web
- **doc_search** (READ): Search documents

### Test Scenarios
- happy_path
- timeout
- error
