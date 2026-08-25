#!/usr/bin/env python3
"""Seed capsule line stages in order for Capsule Line B (PLANT-TBL-IN-001 / LINE-CAP-001)."""

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
)

NOW = datetime.now(timezone.utc)

PLANT_ID = "PLANT-TBL-IN-001"
LINE_ID = "LINE-CAP-001"

STAGES = [
    {
        "_id": "STAGE-CAP-01",
        "id": "STAGE-CAP-01",
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
        "_id": "STAGE-CAP-02",
        "id": "STAGE-CAP-02",
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
        "_id": "STAGE-CAP-03",
        "id": "STAGE-CAP-03",
        "name": "Granulation",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 3,
        "takt_time": 120.0,
        "status": "Operational",
        "efficiency": 85,
        "description": "Wet or dry granulation if required",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-CAP-04",
        "id": "STAGE-CAP-04",
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
        "_id": "STAGE-CAP-05",
        "id": "STAGE-CAP-05",
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
        "_id": "STAGE-CAP-06",
        "id": "STAGE-CAP-06",
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
        "_id": "STAGE-CAP-07",
        "id": "STAGE-CAP-07",
        "name": "Capsule Filling",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 7,
        "takt_time": 90.0,
        "status": "Operational",
        "efficiency": 87,
        "description": "Capsule filling and weight checks",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-CAP-08",
        "id": "STAGE-CAP-08",
        "name": "Polishing / Dedust",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 8,
        "takt_time": 20.0,
        "status": "Operational",
        "efficiency": 95,
        "description": "Capsule polishing and dedusting",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-CAP-09",
        "id": "STAGE-CAP-09",
        "name": "Inspection",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 9,
        "takt_time": 25.0,
        "status": "Operational",
        "efficiency": 94,
        "description": "Visual and automated capsule inspection",
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "_id": "STAGE-CAP-10",
        "id": "STAGE-CAP-10",
        "name": "Packaging",
        "plant_id": PLANT_ID,
        "line_id": LINE_ID,
        "type": "Batch",
        "sequence": 10,
        "takt_time": 60.0,
        "status": "Operational",
        "efficiency": 90,
        "description": "Blister or bottle packaging of capsules",
        "created_at": NOW,
        "updated_at": NOW,
    },
]


async def seed():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DB_NAME]

    print("Inserting capsule line stages...")
    for stage in STAGES:
        await db["industrial_stages"].insert_one(dict(stage))
        await safe_mirror(mirror_document("industrial_stages", stage, "seed"))
        print(f"  + {stage['id']}: {stage['name']} (seq={stage['sequence']})")

    count = await db["industrial_stages"].count_documents({})
    print(f"\nDone. {count} total stages in DB")

    client.close()
    await close_neo4j_mirror_driver()


if __name__ == "__main__":
    asyncio.run(seed())
