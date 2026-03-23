from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.models import Notification


def create_notification(
    db: AsyncSession,
    user_id: int,
    type: str,
    title: str,
    body: str = "",
    link: str = "",
) -> Notification:
    """Add a notification to the session. Caller is responsible for committing."""
    notif = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        link=link,
    )
    db.add(notif)
    return notif
