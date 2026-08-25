# redis

## Capability: redis
- **ID:** cap-db-redis-001
- **Platform:** Database/KeyValue
- **Version:** 1.0.0
- **Status:** active
- **Description:** Redis key-value store for caching and session state
- **Module:** Cerebellum
- **Tags:** database, redis, cache, session

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/redis`
- **Protocol:** http

### Operations
- **get** (READ): Get a value
- **set** (CREATE): Set a value
- **delete** (DELETE): Delete a key
- **expire** (UPDATE): Set TTL on a key

### Test Scenarios
- happy_path
- timeout
- error
