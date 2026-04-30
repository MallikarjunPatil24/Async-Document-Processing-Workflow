import redis.asyncio as redis
from .config import settings

# Async redis client for FastAPI
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

# Sync redis client for Celery worker (if needed for pub/sub directly)
import redis as sync_redis
sync_redis_client = sync_redis.from_url(settings.REDIS_URL, decode_responses=True)
