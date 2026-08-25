# Orders Service

This microservice owns the `order` domain package(s).

## Local run

```bash
uvicorn services.orders.main:app --reload --port 8018
```

## Docker

```bash
docker build -f services/orders/Dockerfile -t monkeypatched-orders .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8018:8000 monkeypatched-orders
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/invoices` (Invoices)
- `GET/POST/PATCH/DELETE` family under `/api/v1/orders` (Orders)
- `GET/POST/PATCH/DELETE` family under `/api/v1/order-details` (Order Details)
- `GET/POST/PATCH/DELETE` family under `/api/v1/order-customer-metrics` (Order Customer Metrics)
- `GET/POST/PATCH/DELETE` family under `/api/v1/order-metadata` (Order Metadata)
- `GET/POST/PATCH/DELETE` family under `/api/v1/order-payment-metadata` (Order Payment Metadata)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
