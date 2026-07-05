from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# Redis-backed so limits are shared across api replicas rather than per-process.
# swallow_errors keeps the app serving requests (unlimited) if Redis is briefly
# down, instead of the rate limiter itself becoming an outage.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    default_limits=["100/minute"],
    swallow_errors=True,
    enabled=settings.rate_limit_enabled,
)
