from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from services.orders.models.order_payment_metadata import (
    OrderPaymentMetadataCreate,
    OrderPaymentMetadataUpdate,
)

COLLECTION = "order_payment_metadata"


def _serialize(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


def _prepare(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, dict):
        return {key: _prepare(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_prepare(item) for item in value]
    return value


async def get_all(
    db: AsyncIOMotorDatabase,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    query: dict = {}
    total = await db[COLLECTION].count_documents(query)
    cursor = db[COLLECTION].find(query).skip((page - 1) * page_size).limit(page_size)
    return [_serialize(doc) async for doc in cursor], total


async def get_by_order_id(db: AsyncIOMotorDatabase, order_id: str) -> Optional[dict]:
    return _serialize(await db[COLLECTION].find_one({"order_id": order_id}))


async def create(db: AsyncIOMotorDatabase, data: OrderPaymentMetadataCreate) -> dict:
    doc = _prepare(data.model_dump())
    await db[COLLECTION].insert_one(doc)
    return _serialize(doc)


async def update(
    db: AsyncIOMotorDatabase,
    order_id: str,
    data: OrderPaymentMetadataUpdate,
) -> Optional[dict]:
    fields = _prepare(data.model_dump(exclude_unset=True))
    if not fields:
        return await get_by_order_id(db, order_id)
    result = await db[COLLECTION].find_one_and_update(
        {"order_id": order_id},
        {"$set": fields},
        return_document=ReturnDocument.AFTER,
    )
    return _serialize(result)


async def delete(db: AsyncIOMotorDatabase, order_id: str) -> bool:
    result = await db[COLLECTION].delete_one({"order_id": order_id})
    return result.deleted_count == 1
