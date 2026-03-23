import json
import logging
from typing import Any, Optional

from app.database import async_session
from app.social.models import ActivityEvent

logger = logging.getLogger(__name__)


async def log_activity(
    user_id: int,
    event_type: str,
    detail: Optional[dict[str, Any]] = None,
    group_id: Optional[int] = None,
) -> None:
    try:
        async with async_session() as db:
            event = ActivityEvent(
                user_id=user_id,
                event_type=event_type,
                detail_json=json.dumps(detail or {}),
                group_id=group_id,
            )
            db.add(event)
            await db.commit()
    except Exception:
        logger.exception("Failed to log activity event: %s for user %s", event_type, user_id)
