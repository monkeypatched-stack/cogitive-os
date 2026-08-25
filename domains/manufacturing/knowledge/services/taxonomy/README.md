# Taxonomy Service

This microservice owns the `taxonomy` domain package(s).

## Local run

```bash
uvicorn services.taxonomy.main:app --reload --port 8025
```

## Docker

```bash
docker build -f services/taxonomy/Dockerfile -t monkeypatched-taxonomy .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8025:8000 monkeypatched-taxonomy
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/families` (Families)
- `GET/POST/PATCH/DELETE` family under `/api/v1/classes` (Classes)
- `GET/POST/PATCH/DELETE` family under `/api/v1/subclasses` (Subclasses)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
