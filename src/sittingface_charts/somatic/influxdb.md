# influxdb

## Capability: influxdb
- **ID:** cap-db-influxdb-001
- **Platform:** Database/TimeSeries
- **Version:** 1.0.0
- **Status:** active
- **Description:** InfluxDB time-series database for events and metrics
- **Module:** Cerebellum
- **Tags:** database, influxdb, time-series, events

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/influxdb`
- **Protocol:** http

### Operations
- **write_lp** (CREATE): Write line protocol data
- **query_sql** (READ): Query with SQL
- **query_influxql** (READ): Query with InfluxQL

### Test Scenarios
- happy_path
- timeout
- error
