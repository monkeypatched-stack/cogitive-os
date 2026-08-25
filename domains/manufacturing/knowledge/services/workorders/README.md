# Workorders Service

This microservice owns task/maintenance work orders and production batch execution records.

## Local run

```bash
uvicorn services.workorders.main:app --reload --port 8027
```

## Docker

```bash
docker build -f services/workorders/Dockerfile -t monkeypatched-workorders .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8027:8000 monkeypatched-workorders
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/workorders` for maintenance/task-oriented work orders.
- `GET/POST/PATCH/DELETE` family under `/api/v1/batch-execution-records` for production batch execution records.

## Domain split

Work orders remain generic task records for maintenance, inspection, calibration, cleaning, repair, and kanban movement. Batch Production Execution Records are the GMP production execution contract for a specific batch and process definition revision. They link the batch to the approved process route, recipe, BOM, SOP documents, instruction templates, IPC results, yield reconciliation, deviations, signatures, audit events, and evidence documents.

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
