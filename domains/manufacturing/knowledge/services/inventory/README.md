# Inventory Service

This microservice owns the `inventory` domain package(s).

## Local run

```bash
uvicorn services.inventory.main:app --reload --port 8016
```

## Docker

```bash
docker build -f services/inventory/Dockerfile -t monkeypatched-inventory .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8016:8000 monkeypatched-inventory
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/stock-adjustment-requests` (Stock Adjustment Requests)
- `GET/POST/PATCH/DELETE` family under `/api/v1/inventory-transactions` (Inventory Transactions)
- `GET/POST/PATCH/DELETE` family under `/api/v1/warehouse-locations` (Warehouse Locations)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
