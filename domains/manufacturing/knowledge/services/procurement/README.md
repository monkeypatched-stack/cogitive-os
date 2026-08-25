# Procurement Service

This microservice owns the `po` domain package(s).

## Local run

```bash
uvicorn services.procurement.main:app --reload --port 8020
```

## Docker

```bash
docker build -f services/procurement/Dockerfile -t monkeypatched-procurement .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8020:8000 monkeypatched-procurement
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/purchase-orders` (Purchase Orders)
- `GET/POST/PATCH/DELETE` family under `/api/v1/purchase-order-shipping-information` (Purchase Order Shipping Information)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
