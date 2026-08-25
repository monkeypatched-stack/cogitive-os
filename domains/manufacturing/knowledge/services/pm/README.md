# Preventive Maintenance Service

This microservice owns the `pm` domain package(s).

## Local run

```bash
uvicorn services.pm.main:app --reload --port 8019
```

## Docker

```bash
docker build -f services/pm/Dockerfile -t monkeypatched-pm .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8019:8000 monkeypatched-pm
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/maintenance` (Maintenance)
- `GET/POST/PATCH/DELETE` family under `/api/v1/calibrations` (Calibrations)
- `GET/POST/PATCH/DELETE` family under `/api/v1/calibrations/{calibration_id}/points` (Calibration Points)
- `GET/POST/PATCH/DELETE` family under `/api/v1/cleaning` (Cleaning)
- `GET/POST/PATCH/DELETE` family under `/api/v1/downtime` (Downtime)
- `GET/POST/PATCH/DELETE` family under `/api/v1/checklists` (Checklists)
- `GET/POST/PATCH/DELETE` family under `/api/v1/sops` (SOPs)
- `POST /api/v1/sops/{sop_id}/simulate` compiles embedded SOP process steps,
  prechecks, postchecks, constraints, and corrective actions into a transient
  canvas and returns a non-mutating simulation trace.
- `POST /api/v1/sops/{sop_id}/change-impact` analyzes a proposed SOP update
  against production/material-flow connections, returns linked SOP graph
  changes, and can stage them into approval-gated change control.
- `GET/POST/PATCH/DELETE` family under `/api/v1/weekly-schedules` (Weekly Schedules)
- `GET/POST/PATCH/DELETE` family under `/api/v1/calendar-bookings` (Calendar Bookings)
- `GET/POST/PATCH/DELETE` family under `/api/v1/kanban-boards` (Kanban Boards)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
