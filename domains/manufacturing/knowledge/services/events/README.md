# Events Service

This microservice owns the `events` domain package(s).

## Local run

```bash
uvicorn services.events.main:app --reload --port 8013
```

## Docker

```bash
docker build -f services/events/Dockerfile -t monkeypatched-events .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8013:8000 monkeypatched-events
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/events` (Events)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
