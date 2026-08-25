from datetime import date
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from services.shifts.models.shift import ShiftScheduleCreate, ShiftScheduleUpdate

COLLECTION = "shifts"


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


def _dump(data) -> dict:
    doc = data.model_dump(mode="json", exclude_unset=True)
    doc.pop("headcount", None)
    return doc


async def get_all(
    db: AsyncIOMotorDatabase,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    query: dict = {}
    total = await db[COLLECTION].count_documents(query)
    cursor = db[COLLECTION].find(query).skip((page - 1) * page_size).limit(page_size)
    return [_serialize(d) async for d in cursor], total


async def get_by_id(db: AsyncIOMotorDatabase, shift_id: str) -> Optional[dict]:
    doc = await db[COLLECTION].find_one({"id": shift_id})
    return _serialize(doc) if doc else None


async def get_by_factory(db: AsyncIOMotorDatabase, factory_id: str) -> list[dict]:
    cursor = db[COLLECTION].find({"factory_id": factory_id})
    return [_serialize(d) async for d in cursor]


async def get_by_template(db: AsyncIOMotorDatabase, template_id: str) -> list[dict]:
    cursor = db[COLLECTION].find({"template_id": template_id})
    return [_serialize(d) async for d in cursor]


async def get_by_date(db: AsyncIOMotorDatabase, shift_date: date) -> list[dict]:
    cursor = db[COLLECTION].find({"shift_date": shift_date.isoformat()})
    return [_serialize(d) async for d in cursor]


async def create(db: AsyncIOMotorDatabase, data: ShiftScheduleCreate) -> dict:
    doc = _dump(data)
    await db[COLLECTION].insert_one(doc)
    return _serialize(doc)


async def update(
    db: AsyncIOMotorDatabase,
    shift_id: str,
    data: ShiftScheduleUpdate,
) -> Optional[dict]:
    fields = _dump(data)
    if not fields:
        return await get_by_id(db, shift_id)
    result = await db[COLLECTION].find_one_and_update(
        {"id": shift_id},
        {"$set": fields},
        return_document=ReturnDocument.AFTER,
    )
    return _serialize(result) if result else None


async def delete(db: AsyncIOMotorDatabase, shift_id: str) -> bool:
    result = await db[COLLECTION].delete_one({"id": shift_id})
    return result.deleted_count == 1
