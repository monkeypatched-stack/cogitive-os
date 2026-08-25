# Facilities Service

This microservice owns the `facilities` domain package(s).

## Local run

```bash
uvicorn services.facilities.main:app --reload --port 8014
```

## Docker

```bash
docker build -f services/facilities/Dockerfile -t monkeypatched-facilities .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8014:8000 monkeypatched-facilities
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/plants` (Plants)
- `GET/POST/PATCH/DELETE` family under `/api/v1/lines` (Lines)
- `GET/POST/PATCH/DELETE` family under `/api/v1/stages` (Stages)
- `GET/POST/PATCH/DELETE` family under `/api/v1/workstations` (Workstations)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
