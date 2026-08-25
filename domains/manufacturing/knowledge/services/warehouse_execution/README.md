# Warehouse Execution Service

Owns executable WMS work: warehouse tasks, assignment, scan validation, putaway, picking, packing, movement, staging, dispatch handoff, and exception resolution.

## Local Run

```bash
uvicorn services.warehouse_execution.main:app --reload --port 8034
```

## Docker

```bash
docker build -f services/warehouse_execution/Dockerfile -t monkeypatched-warehouse-execution .
docker run --env MONGODB_URL=mongodb://localhost:27017 --env DB_NAME=industrial_db -p 8034:8000 monkeypatched-warehouse-execution
```

## Routes

- `GET /api/v1/warehouse-execution/capabilities`
