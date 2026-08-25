# Capability: mongodb

- **ID:** cap-db-mongodb-001
- **Platform:** Database/Document
- **Version:** 1.0.0
- **Status:** active
- **Description:** MongoDB document database driver for CRUD operations and change streams
- **Authored by:** Prashun Javeri
- **Module:** Cerebellum
- **Tags:** database, mongodb, document, nosql, motor, pymongo

## Auth
- **Type:** none

## Endpoint
- **Base URL:** `mongodb://localhost:27017`
- **Protocol:** mongodb
- **Timeout:** 5s

## Operations
| Name | Method | Description |
|------|--------|-------------|
| find | READ | Query documents from a collection |
| insert_one | CREATE | Insert a single document |
| update_one | UPDATE | Update a single document |
| delete_one | DELETE | Delete a single document |
| aggregate | READ | Run an aggregation pipeline |

## Rate Limiting
- **Requests/hour:** 10000
- **Strategy:** fixed_window
- **Max retries:** 3

## Error Handling
- **Transient:** [500, 502, 503, 504]
- **Permanent:** [400, 401, 403, 404]
- **Circuit breaker:** 5 failures / 60s

## Tests
- happy_path_crud
- connection_timeout
- authentication_failure

## Code Generation
- **Target:** python
- **Base class:** Capability
- **Runtime module:** src.cerebellum.capabilities.mongodb
- **Auto-register:** True
