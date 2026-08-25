# storage

## Capability: storage
- **ID:** cap-storage-001
- **Platform:** Storage/Object
- **Version:** 1.0.0
- **Status:** active
- **Description:** Object storage (S3, MinIO, local filesystem)
- **Module:** Cerebellum
- **Tags:** storage, s3, object

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/storage`
- **Protocol:** http

### Operations
- **upload** (CREATE): Upload a file
- **download** (READ): Download a file
- **list** (READ): List objects

### Test Scenarios
- happy_path
- timeout
- error
