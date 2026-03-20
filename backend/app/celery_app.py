"""Celery application — optional, requires REDIS_URL."""

import logging
from app.config import settings

_logger = logging.getLogger(__name__)

celery_app = None

if settings.REDIS_URL:
    from celery import Celery

    celery_app = Celery(
        "hang",
        broker=settings.REDIS_URL,
        backend=settings.REDIS_URL,
    )
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        task_soft_time_limit=300,  # 5 min soft limit
        task_time_limit=600,       # 10 min hard limit
        worker_prefetch_multiplier=1,
        task_acks_late=True,
    )
    _logger.info("Celery configured with Redis broker")
else:
    _logger.info("REDIS_URL not set — Celery disabled, using in-process tasks")
