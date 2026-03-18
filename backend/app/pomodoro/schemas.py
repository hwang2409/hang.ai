from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CreateSessionRequest(BaseModel):
    label: Optional[str] = None
    session_type: str  # focus, short_break, long_break
    duration_minutes: int
    planned_minutes: int
    completed: bool = True
    note_id: Optional[int] = None
    started_at: Optional[datetime] = None


class SessionResponse(BaseModel):
    id: int
    label: Optional[str] = None
    session_type: str
    duration_minutes: int
    planned_minutes: int
    completed: bool
    note_id: Optional[int] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class StatsResponse(BaseModel):
    today_sessions: int
    today_focus_minutes: int
    week_sessions: int
    week_focus_minutes: int
    current_streak: int
    total_sessions: int
    total_focus_minutes: int


class WeeklyHours(BaseModel):
    week: str  # ISO date of week start (Monday)
    hours: float
    sessions: int


class AnalyticsResponse(BaseModel):
    weekly_hours: list[WeeklyHours]
    avg_hours_per_week: float
    total_hours: float
    best_week_hours: float
    trend: str  # "increasing" | "decreasing" | "stable"
