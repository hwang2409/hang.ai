from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class StudyPlanGenerate(BaseModel):
    title: str
    syllabus_text: str
    exam_date: date


class StudyPlanItemResponse(BaseModel):
    id: int
    plan_id: int
    day_number: int
    date: date
    topic: str
    description: str
    completed: bool
    todo_id: Optional[int] = None
    note_id: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class StudyPlanResponse(BaseModel):
    id: int
    title: str
    exam_date: date
    syllabus_text: str
    status: str
    created_at: datetime
    updated_at: datetime
    items: list[StudyPlanItemResponse] = []

    model_config = {"from_attributes": True}


class StudyPlanListItem(BaseModel):
    id: int
    title: str
    exam_date: date
    status: str
    created_at: datetime
    item_count: int = 0
    completed_count: int = 0

    model_config = {"from_attributes": True}


class StudyPlanItemUpdate(BaseModel):
    completed: Optional[bool] = None
