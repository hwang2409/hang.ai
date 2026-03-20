from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class IntegrationResponse(BaseModel):
    id: int
    type: str
    enabled: bool
    token: str
    config: dict = {}
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CalendarFeedCreate(BaseModel):
    pass


class WebhookCreate(BaseModel):
    url: str
    events: dict = {
        "daily_brief": True,
        "flashcard_due": True,
        "quiz_complete": True,
        "study_streak": True,
    }


class WebhookUpdate(BaseModel):
    url: Optional[str] = None
    events: Optional[dict] = None
    enabled: Optional[bool] = None


class WebhookTestResponse(BaseModel):
    success: bool
    status_code: Optional[int] = None
    error: Optional[str] = None


class GoogleCalendarAuthorizeResponse(BaseModel):
    authorize_url: str


class SyncResponse(BaseModel):
    status: str
