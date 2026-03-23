from datetime import datetime

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    body: str = ""
    link: str = ""
    is_read: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse] = []
    unread_count: int = 0
