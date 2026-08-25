# Auth and Organization Service

This microservice owns the `login`, `organizations` domain package(s).

## Local run

```bash
uvicorn services.auth.main:app --reload --port 8010
```

## Docker

```bash
docker build -f services/auth/Dockerfile -t monkeypatched-auth .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8010:8000 monkeypatched-auth
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/auth` (Auth)
- `GET/POST/PATCH/DELETE` family under `/api/v1/me` (Me)
- `GET/POST/PATCH/DELETE` family under `/api/v1/users` (Users)
- `GET/POST/PATCH/DELETE` family under `/api/v1/roles` (Roles)
- `GET/POST/PATCH/DELETE` family under `/api/v1/permissions` (Permissions)
- `GET/POST/PATCH/DELETE` family under `/api/v1/departments` (Departments)
- `GET/POST/PATCH/DELETE` family under `/api/v1/teams` (Teams)
- `GET/POST/PATCH/DELETE` family under `/api/v1/members` (Members)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
