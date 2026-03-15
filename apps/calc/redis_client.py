import redis.asyncio as redis

from config import get_settings

redis_client = None


def _get_client():
    global redis_client
    if redis_client is None:
        settings = get_settings()
        redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return redis_client


async def publish_event(channel: str, payload: str) -> None:
    try:
        client = _get_client()
        await client.publish(channel, payload)
    except RuntimeError:
        # Tests may run without full runtime env; publish is best effort.
        return
