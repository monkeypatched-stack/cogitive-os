# neo4j

## Capability: neo4j
- **ID:** cap-db-neo4j-001
- **Platform:** Database/Graph
- **Version:** 1.0.0
- **Status:** active
- **Description:** Neo4j graph database for entity relationships
- **Module:** Cerebellum
- **Tags:** database, neo4j, graph, cypher

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/neo4j`
- **Protocol:** http

### Operations
- **query** (READ): Execute a Cypher query
- **create_node** (CREATE): Create a node
- **create_relationship** (CREATE): Create a relationship
- **delete_node** (DELETE): Delete a node

### Test Scenarios
- happy_path
- timeout
- error
