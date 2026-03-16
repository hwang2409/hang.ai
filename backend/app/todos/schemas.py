from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class TodoCreate(BaseModel):
    text: str
    due_date: Optional[date] = None
    priority: int = 0


class TodoUpdate(BaseModel):
    text: Optional[str] = None
    completed: Optional[bool] = None
    due_date: Optional[date] = None
    priority: Optional[int] = None


class TodoResponse(BaseModel):
    id: int
    user_id: int
    text: str
    completed: bool
    due_date: Optional[date] = None
    priority: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}
