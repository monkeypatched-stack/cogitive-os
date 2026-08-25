# Coding Standards Review

Generated from somatic capability and agent charts.

## Summary

- **Capabilities:** 26
- **Agents:** 10
- **Total Operations:** 59

## Capability Operations

| Capability | Operation | Method | Description |
|------------|-----------|--------|-------------|
| agents | discover | READ | Discover available agents |
| agents | invoke | CREATE | Invoke an external agent |
| browsers | navigate | READ | Navigate to a URL |
| browsers | screenshot | READ | Take a screenshot |
| browsers | extract | READ | Extract text from a page |
| cloud | list_resources | READ | List cloud resources |
| cloud | provision | CREATE | Provision a resource |
| communication | send | CREATE | Send a message |
| elasticsearch | index | CREATE | Index a document |
| elasticsearch | search | READ | Search documents |
| elasticsearch | delete | DELETE | Delete a document |
| elasticsearch_driver | connect | CREATE | Connect to Elasticsearch |
| elasticsearch_driver | bulk_index | CREATE | Bulk index documents |
| graphql | query | READ | Execute a GraphQL query |
| graphql | mutate | CREATE | Execute a GraphQL mutation |
| influxdb | write_lp | CREATE | Write line protocol data |
| influxdb | query_sql | READ | Query with SQL |
| influxdb | query_influxql | READ | Query with InfluxQL |
| infrastructure | list_containers | READ | List containers |
| infrastructure | deploy | CREATE | Deploy a service |
| mongodb | find | READ | Query documents |
| mongodb | insert_one | CREATE | Insert a document |
| mongodb | update_one | UPDATE | Update a document |
| mongodb | delete_one | DELETE | Delete a document |
| mongodb_driver | connect | CREATE | Connect to MongoDB |
| mongodb_driver | disconnect | DELETE | Disconnect from MongoDB |
| neo4j | query | READ | Execute a Cypher query |
| neo4j | create_node | CREATE | Create a node |
| neo4j | create_relationship | CREATE | Create a relationship |
| neo4j | delete_node | DELETE | Delete a node |

## Standards Checklist

- [ ] All public APIs have type hints
- [ ] All functions have docstrings
- [ ] No hardcoded secrets
- [ ] Error handling covers all failure modes
- [ ] Circuit breakers on external calls
- [ ] Structured logging with trace IDs
- [ ] Health checks for all services
- [ ] Rate limiting on all endpoints
