---
description: "Quick MongoDB data inspection via motor. Usage: $ARGUMENTS (collection name or query description)"
---

# MongoDB Data Check

Run an inline motor/asyncio script to inspect or fix MongoDB data.

## Default Template

```bash
cd /Users/prashunjaveri/Code/monkeypatched && .venv/bin/python3 -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from services.common.config import settings

async def check():
    client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=3000)
    db = client[settings.DB_NAME]
    # --- customize query here ---
    count = await db.COLLECTION.count_documents({})
    print(f'COLLECTION count: {count}')
    async for doc in db.COLLECTION.find().limit(5):
        print(doc)

asyncio.run(check())
"
```

## Parameters

- `$1` or `$ARGUMENTS`: Description of what to check (collection name, query, etc.)

## Common Variations

- **Count documents**: Replace `COLLECTION` with target collection name
- **Find specific**: Add `.find({"field": "value"})` filter
- **Fix data**: Use `update_one` / `update_many` inside the async function
- **Check connection**: Just run `client.server_info()` to verify MongoDB is reachable

## Notes

- Uses `services.common.config.settings` for connection string and DB name.
- Set `serverSelectionTimeoutMS=3000` to fail fast if MongoDB is unreachable.
