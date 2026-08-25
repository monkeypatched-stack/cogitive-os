# Suppliers Service

This microservice owns the `supplier` domain package(s).

## Local run

```bash
uvicorn services.suppliers.main:app --reload --port 8024
```

## Docker

```bash
docker build -f services/suppliers/Dockerfile -t monkeypatched-suppliers .
docker run --env MONGODB_URL=mongodb://host.docker.internal:27017 --env DB_NAME=industrial_db -p 8024:8000 monkeypatched-suppliers
```

## Routes

- `GET/POST/PATCH/DELETE` family under `/api/v1/supplier-details` (Supplier Details)
- `GET/POST/PATCH/DELETE` family under `/api/v1/supplier-capabilities` (Supplier Capabilities)
- `GET/POST/PATCH/DELETE` family under `/api/v1/supplier-certifications` (Supplier Certifications)
- `GET/POST/PATCH/DELETE` family under `/api/v1/supplier-financials` (Supplier Financials)
- `GET/POST/PATCH/DELETE` family under `/api/v1/supplier-inventory` (Supplier Inventory)
- `GET/POST/PATCH/DELETE` family under `/api/v1/supplier-locations` (Supplier Locations)
- `GET/POST/PATCH/DELETE` family under `/api/v1/supplier-pricing` (Supplier Pricing)
- `GET/POST/PATCH/DELETE` family under `/api/v1/supplier-quality` (Supplier Quality)
- `GET/POST/PATCH/DELETE` family under `/api/v1/supplier-shipping` (Supplier Shipping)

## Notes

The router/helper/model implementations are imported from `src/routers`, `src/helpers`, and `src/models` for this domain. Authentication still uses the shared bearer-token helpers and the seeded roles/permissions in `src/mock/organizations`.
