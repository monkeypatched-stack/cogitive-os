"""Chaos test fixtures — provides mongo_client when MongoDB is reachable."""

from __future__ import annotations

import asyncio

import pytest


@pytest.fixture
def mongo_client():
    """Async motor client to local MongoDB; skip all chaos tests if unavailable."""
    motor = pytest.importorskip("motor.motor_asyncio")
    try:
        client = motor.AsyncIOMotorClient(
            "mongodb://localhost:27017",
            serverSelectionTimeoutMS=2000,
        )
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(client.admin.command("ping"))
        except Exception:
            pytest.skip("MongoDB not running on localhost:27017")
        finally:
            loop.close()
        yield client
        client.close()
    except Exception:
        pytest.skip("MongoDB not available")
