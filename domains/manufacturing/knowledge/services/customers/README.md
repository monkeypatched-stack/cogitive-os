# Customers Service

This microservice owns the `customers` domain package(s).

## Local run

```bash
uvicorn services.customers.main:app --reload --port 8012
```

## Docker

```bash
docker build -f services/customers/Dockerfile -t monkeypatched-customers .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8012:8000 monkeypatched-customers
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/customer-details` (Customer Details)
- `GET/POST/PATCH/DELETE` family under `/api/v1/customer-metadata` (Customer Metadata)
- `GET/POST/PATCH/DELETE` family under `/api/v1/customer-order-metrics` (Customer Order Metrics)
- `GET/POST/PATCH/DELETE` family under `/api/v1/customer-payment-data` (Customer Payment Data)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
