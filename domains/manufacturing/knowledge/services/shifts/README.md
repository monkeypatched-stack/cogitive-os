# Shifts Service

This microservice owns the `shifts` domain package(s).

## Local run

```bash
uvicorn services.shifts.main:app --reload --port 8023
```

## Docker

```bash
docker build -f services/shifts/Dockerfile -t monkeypatched-shifts .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8023:8000 monkeypatched-shifts
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/shift-templates` (Shift Templates)
- `GET/POST/PATCH/DELETE` family under `/api/v1/shifts` (Shifts)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
