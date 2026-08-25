# Supply Allocation Service

Owns ATP/ATA calculations, reservations, commitments, shortage detection, and allocation arbitration across sales orders, work orders, transfers, and replenishment demand.

## Local Run

```bash
uvicorn services.supply_allocation.main:app --reload --port 8032
```

## Docker

```bash
docker build -f services/supply_allocation/Dockerfile -t monkeypatched-supply-allocation .
docker run --env MONGODB_URL=mongodb://localhost:27017 --env DB_NAME=industrial_db -p 8032:8000 monkeypatched-supply-allocation
```

## Routes

- `GET /api/v1/supply-allocation/capabilities`
