# Changeover Service

This microservice owns the `changeover` domain package(s).

## Local run

```bash
uvicorn services.changeover.main:app --reload --port 8028
```

## Docker

```bash
docker build -f services/changeover/Dockerfile -t monkeypatched-changeover .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8028:8000 monkeypatched-changeover
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/changeovers/matrix` (Changeover Matrix)
- `GET/POST/PATCH/DELETE` family under `/api/v1/changeovers/procedures` (Changeover Procedures)
- `GET/POST/PATCH/DELETE` family under `/api/v1/changeovers` (Changeover Windows)
- `GET/POST/PATCH/DELETE` family under `/api/v1/changeovers` (Changeover KPIs)
- `GET/POST/PATCH/DELETE` family under `/api/v1/changeovers` (Changeover Events)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
