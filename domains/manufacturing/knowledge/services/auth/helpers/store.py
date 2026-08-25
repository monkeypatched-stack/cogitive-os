import redis.asyncio as aioredis
from services.common.config import settings

_redis: aioredis.Redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

# TTL matches refresh token expiry so Redis auto-cleans expired tokens
_TTL = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60


async def save_refresh_token(token: str) -> None:
    await _redis.setex(f"refresh:{token}", _TTL, "1")


async def token_exists(token: str) -> bool:
    return await _redis.exists(f"refresh:{token}") == 1


async def revoke_refresh_token(token: str) -> None:
    await _redis.delete(f"refresh:{token}")


def session_key(user_id: str, key: str) -> str:
    return f"session:{user_id}:{key}"


async def save_session_value(user_id: str, key: str, value: str) -> None:
    await _redis.setex(session_key(user_id, key), _TTL, value)


async def get_session_value(user_id: str, key: str) -> str | None:
    return await _redis.get(session_key(user_id, key))


async def delete_session_value(user_id: str, key: str) -> bool:
    return await _redis.delete(session_key(user_id, key)) == 1


async def save_session_values(user_id: str, values: dict[str, str]) -> None:
    if not values:
        return

    pipe = _redis.pipeline()
    for key, value in values.items():
        pipe.setex(session_key(user_id, key), _TTL, value)
    await pipe.execute()


async def get_session_values(user_id: str, keys: list[str]) -> dict[str, str | None]:
    if not keys:
        return {}

    redis_keys = [session_key(user_id, key) for key in keys]
    values = await _redis.mget(redis_keys)
    return dict(zip(keys, values))
