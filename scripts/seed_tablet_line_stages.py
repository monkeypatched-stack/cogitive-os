#!/usr/bin/env python3
"""Seed tablet line stages in order for Tablet Line A (PLANT-TBL-IN-001 / LINE-TAB-001)."""

import asyncio
import sys
from datetime import datetime, timezone

sys.path.insert(0, "/Users/prashunjaveri/Code/monkeypatched")

from motor.motor_asyncio import AsyncIOMotorClient
from services.common.config import settings
from services.common.neo4j_mirror import (
    mirror_document,
    safe_mirror,
    close_neo4j_mirror_driver,
    reset_neo4j_mirror,
)

NOW = datetime.now(timezone.utc)

PLANT_ID = "PLANT-TBL-IN-001"
LINE_ID = "LINE-TAB-001"

STAGES = [
    {
        "_id": "STAGE-01",
        "id": "STAGE-01",
        "name": "Dispensing",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 1,
        "takt_time": 60.0,
        "status": "Operational",
        "efficiency": 90,
        "description": "Raw material dispensing and weighing",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-03",
        "id": "STAGE-03",
        "name": "Sifting / Milling",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 2,
        "takt_time": 30.0,
        "status": "Operational",
        "efficiency": 92,
        "description": "Sifting and milling of raw materials",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-02",
        "id": "STAGE-02",
        "name": "Granulation",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 3,
        "takt_time": 120.0,
        "status": "Operational",
        "efficiency": 85,
        "description": "Wet or dry granulation of blended materials",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-09",
        "id": "STAGE-09",
        "name": "Drying (FBD)",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 4,
        "takt_time": 180.0,
        "status": "Operational",
        "efficiency": 88,
        "description": "Fluid bed drying of wet granules",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-10",
        "id": "STAGE-10",
        "name": "Sizing / Milling (post-dry)",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 5,
        "takt_time": 30.0,
        "status": "Operational",
        "efficiency": 91,
        "description": "Sizing and milling of dried granules",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-04",
        "id": "STAGE-04",
        "name": "Blending",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 6,
        "takt_time": 45.0,
        "status": "Operational",
        "efficiency": 93,
        "description": "Blending and lubrication of granules",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-05",
        "id": "STAGE-05",
        "name": "Compression",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 7,
        "takt_time": 120.0,
        "status": "Operational",
        "efficiency": 88,
        "description": "Tablet compression and in-process checks",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-06",
        "id": "STAGE-06",
        "name": "Film Coating",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 8,
        "takt_time": 150.0,
        "status": "Operational",
        "efficiency": 86,
        "description": "Film or sugar coating of tablets if applicable",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-07",
        "id": "STAGE-07",
        "name": "Inspection / Dedust / Polish",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 9,
        "takt_time": 20.0,
        "status": "Operational",
        "efficiency": 95,
        "description": "Tablet inspection, dedusting, and polishing",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-08",
        "id": "STAGE-08",
        "name": "Packaging",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 10,
        "takt_time": 60.0,
        "status": "Operational",
        "efficiency": 90,
        "description": "Strip, blister, or bottle packaging of tablets",
        "created_at": NOW,
        "updated_at": NOW,
    },
]


async def seed():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DB_NAME]

    print("Clearing existing stages...")
    await db["industrial_stages"].delete_many({})

    print("Inserting stages...")
    for stage in STAGES:
        await db["industrial_stages"].insert_one(dict(stage))
        await safe_mirror(mirror_document("industrial_stages", stage, "seed"))
        print(f"  + {stage['id']}: {stage['name']} (seq={stage['sequence']})")

    count = await db["industrial_stages"].count_documents({})
    print(f"\nDone. {count} stages seeded for {LINE_ID}")

    client.close()
    await close_neo4j_mirror_driver()


if __name__ == "__main__":
    asyncio.run(seed())
