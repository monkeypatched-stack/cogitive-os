# mongodb

## Capability: mongodb
- **ID:** cap-db-mongodb-001
- **Platform:** Database/Document
- **Version:** 1.0.0
- **Status:** active
- **Description:** MongoDB document database driver for CRUD operations and change streams
- **Module:** Cerebellum
- **Tags:** database, mongodb, document, nosql, motor, pymongo

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/mongodb`
- **Protocol:** http

### Operations
- **find** (READ): Query documents
- **insert_one** (CREATE): Insert a document
- **update_one** (UPDATE): Update a document
- **delete_one** (DELETE): Delete a document

### Test Scenarios
- happy_path
- timeout
- error
