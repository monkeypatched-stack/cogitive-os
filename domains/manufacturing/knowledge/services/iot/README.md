# IoT Service

This microservice owns the `iot` domain package(s).

## Local run

```bash
uvicorn services.iot.main:app --reload --port 8017
```

## Docker

```bash
docker build -f services/iot/Dockerfile -t monkeypatched-iot .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8017:8000 monkeypatched-iot
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/ble-devices` (BLE Devices)
- `GET/POST/PATCH/DELETE` family under `/api/v1/sensors` (Sensors)
- `GET/POST/PATCH/DELETE` family under `/api/v1/servers` (Servers)
- `GET/POST/PATCH/DELETE` family under `/api/v1/uwb-devices` (UWB Devices)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
