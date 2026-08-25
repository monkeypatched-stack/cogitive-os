# Products Service

This microservice owns the `products` domain package(s).

## Local run

```bash
uvicorn services.products.main:app --reload --port 8021
```

## Docker

```bash
docker build -f services/products/Dockerfile -t monkeypatched-products .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8021:8000 monkeypatched-products
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/products` (Products)
- `GET/POST/PATCH/DELETE` family under `/api/v1/boms` (BOMs)
- `GET/POST/PATCH/DELETE` family under `/api/v1/products/components` (Product Components)
- `GET/POST/PATCH/DELETE` family under `/api/v1/products/inventory` (Product Inventory)
- `GET/POST/PATCH/DELETE` family under `/api/v1/products/pricing` (Product Pricing)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
