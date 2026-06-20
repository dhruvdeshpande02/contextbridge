from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "contextbridge",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.process_meeting"],
)
celery_app.conf.update(task_serializer="json", result_serializer="json", accept_content=["json"])
