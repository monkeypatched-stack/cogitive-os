"""Hierarchical RBAC resolution.

Roles may declare `parent_role_ids` (new optional field — backward compatible).
This module walks the hierarchy and returns the full, deduplicated permission set.

Example hierarchy:
  production_worker → permissions: [read:work_orders]
  supervisor        → parent_role_ids: [production_worker]
                      permissions: [read:reports, approve:work_orders]
  manager           → parent_role_ids: [supervisor]
                      permissions: [approve:budgets]

  resolve_permissions(db, ["manager"]) →
      [approve:budgets, approve:work_orders, read:reports, read:work_orders]

Cycle guard: visited set prevents infinite loops on misconfigured hierarchies.
Depth limit: max 10 levels to bound MongoDB round-trips.
"""

from __future__ import annotations

import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

_COLLECTION = "roles"
_MAX_DEPTH = 10


async def resolve_permissions(
    db: AsyncIOMotorDatabase,
    role_ids: list[str],
    *,
    _visited: frozenset[str] | None = None,
    _depth: int = 0,
) -> list[str]:
    """Return the full permission set for the given role_ids, including inherited permissions.

    Falls back to the direct permission list when no parent_role_ids are present
    (i.e., existing roles without hierarchy are completely unaffected).
    """
    if _depth >= _MAX_DEPTH or not role_ids:
        return []

    visited = _visited or frozenset()
    unvisited = [rid for rid in role_ids if rid not in visited]
    if not unvisited:
        return []

    permissions: set[str] = set()
    parent_ids: list[str] = []

    async for role in db[_COLLECTION].find(
        {"role_id": {"$in": unvisited}, "is_active": {"$ne": False}},
        {"_id": 0, "role_id": 1, "permissions": 1, "parent_role_ids": 1},
    ):
        permissions.update(role.get("permissions") or [])
        parent_ids.extend(role.get("parent_role_ids") or [])

    new_visited = visited | frozenset(unvisited)

    if parent_ids:
        inherited = await resolve_permissions(
            db, parent_ids, _visited=new_visited, _depth=_depth + 1
        )
        permissions.update(inherited)

    return sorted(permissions)


async def role_hierarchy(
    db: AsyncIOMotorDatabase,
    role_id: str,
) -> dict:
    """Return the full role tree for a single role_id (for introspection/debug)."""
    role = await db[_COLLECTION].find_one({"role_id": role_id}, {"_id": 0})
    if not role:
        return {}
    result = {
        "role_id": role_id,
        "name": role.get("name"),
        "direct_permissions": role.get("permissions", []),
        "parent_role_ids": role.get("parent_role_ids", []),
        "parents": [],
    }
    for parent_id in role.get("parent_role_ids") or []:
        result["parents"].append(await role_hierarchy(db, parent_id))
    return result
