"""Optional Redis cache. Falls back to no-op if Redis is unavailable."""

import json
import logging
from typing import Any, Optional

_logger = logging.getLogger(__name__)
_redis = None


async def init_cache() -> None:
    """Initialize Redis connection. Safe to call even if Redis is unavailable."""
    global _redis
    from app.config import settings
    if not settings.REDIS_URL:
        _logger.info("REDIS_URL not set — caching disabled")
        return
    try:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
        )
        await _redis.ping()
        _logger.info("Redis cache connected")
    except Exception as e:
        _logger.warning("Redis connection failed, caching disabled: %s", e)
        _redis = None


async def close_cache() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


async def cache_get(key: str) -> Optional[Any]:
    if not _redis:
        return None
    try:
        data = await _redis.get(key)
        return json.loads(data) if data else None
    except Exception:
        return None


async def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    if not _redis:
        return
    try:
        await _redis.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception:
        pass


async def cache_delete_pattern(pattern: str) -> None:
    """Delete all keys matching a pattern. Use sparingly."""
    if not _redis:
        return
    try:
        keys = []
        async for key in _redis.scan_iter(match=pattern):
            keys.append(key)
        if keys:
            await _redis.delete(*keys)
    except Exception:
        pass
