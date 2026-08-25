# Assets Service

This microservice owns the `assets` domain package(s).

## Local run

```bash
uvicorn services.assets.main:app --reload --port 8011
```

## Docker

```bash
docker build -f services/assets/Dockerfile -t monkeypatched-assets .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8011:8000 monkeypatched-assets
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/devices` (Devices)
- `GET/POST/PATCH/DELETE` family under `/api/v1/equipment` (Equipment)
- `GET/POST/PATCH/DELETE` family under `/api/v1/machines` (Machines)
- `GET/POST/PATCH/DELETE` family under `/api/v1/chemicals` (Chemicals)
- `GET/POST/PATCH/DELETE` family under `/api/v1/parts` (Parts)
- `GET/POST/PATCH/DELETE` family under `/api/v1/plcs` (PLCs)
- `GET/POST/PATCH/DELETE` family under `/api/v1/rfid-tags` (RFID Tags)
- `GET/POST/PATCH/DELETE` family under `/api/v1/tools` (Tools)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
