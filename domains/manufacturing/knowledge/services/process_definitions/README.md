# Process Definition Service

This microservice owns the process definition domain: approved/versioned process routes, process steps, process checks, constraints, corrections, and process route canvas layouts.

## Local run

```bash
uvicorn services.process_definitions.main:app --reload --port 8026
```

## Docker

```bash
docker build -f services/process_definitions/Dockerfile -t monkeypatched-process-definitions .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8026:8000 monkeypatched-process-definitions
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/process-definitions` (Process Definitions)
- `POST /api/v1/process-definitions/backfill/recipe-routes` converts existing recipe route and batch recipe seed records into process definitions.
- `POST /api/v1/process-definitions/{id}/submit`, `/approve`, `/retire`, and `/new-revision` manage process definition lifecycle.
- `GET/POST/PATCH/DELETE` family under `/api/v1/process-steps` (Process Steps)
- `GET/POST/PATCH/DELETE` family under `/api/v1/process-prechecks` (Process Prechecks)
- `GET/POST/PATCH/DELETE` family under `/api/v1/process-postchecks` (Process Postchecks)
- `GET/POST/PATCH/DELETE` family under `/api/v1/process-constraints` (Process Constraints)
- `GET/POST/PATCH/DELETE` family under `/api/v1/process-corrections` (Process Corrections)

## Notes

Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
