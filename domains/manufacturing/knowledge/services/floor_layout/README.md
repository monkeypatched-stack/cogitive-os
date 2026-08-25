# Floor Layout Service

This microservice owns the `floor_layout` domain package(s).

## Local run

```bash
uvicorn services.floor_layout.main:app --reload --port 8015
```

## Docker

```bash
docker build -f services/floor_layout/Dockerfile -t monkeypatched-floor_layout .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8015:8000 monkeypatched-floor_layout
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/buildings` (Buildings)
- `GET/POST/PATCH/DELETE` family under `/api/v1/floors` (Floors)
- `GET/POST/PATCH/DELETE` family under `/api/v1/rooms` (Rooms)
- `GET/POST/PATCH/DELETE` family under `/api/v1/bays` (Bays)
- `GET/POST/PATCH/DELETE` family under `/api/v1/locations` (Locations)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
