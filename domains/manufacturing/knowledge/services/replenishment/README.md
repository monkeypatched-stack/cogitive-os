# Replenishment Service

Owns reorder planning, safety stock monitoring, lead-time planning, purchase proposals, transfer proposals, and expedite recommendations.

## Local Run

```bash
uvicorn services.replenishment.main:app --reload --port 8033
```

## Docker

```bash
docker build -f services/replenishment/Dockerfile -t monkeypatched-replenishment .
docker run --env MONGODB_URL=mongodb://localhost:27017 --env DB_NAME=industrial_db -p 8033:8000 monkeypatched-replenishment
```

## Routes

- `GET /api/v1/replenishment/capabilities`
