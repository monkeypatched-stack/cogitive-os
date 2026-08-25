# Shipping Service

This microservice owns the `shipping` domain package(s).

## Local run

```bash
uvicorn services.shipping.main:app --reload --port 8022
```

## Docker

```bash
docker build -f services/shipping/Dockerfile -t monkeypatched-shipping .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8022:8000 monkeypatched-shipping
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/shipping-information` (Shipping Information)
- `GET/POST/PATCH/DELETE` family under `/api/v1/shipping-providers` (Shipping Providers)
- `GET/POST/PATCH/DELETE` family under `/api/v1/shipping-provider-metadata` (Shipping Provider Metadata)
- `GET/POST/PATCH/DELETE` family under `/api/v1/waybills` (Waybills)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
