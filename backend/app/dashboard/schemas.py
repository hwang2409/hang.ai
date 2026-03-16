from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class DueFlashcard(BaseModel):
    id: int
    front: str
    back: str
    next_review: datetime
    model_config = {"from_attributes": True}


class WeakTopic(BaseModel):
    id: int
    topic: str
    score: int
    created_at: datetime
    model_config = {"from_attributes": True}


class OverdueTodo(BaseModel):
    id: int
    text: str
    due_date: Optional[date] = None
    priority: int = 0
    model_config = {"from_attributes": True}


class StaleNote(BaseModel):
    id: int
    title: str
    updated_at: datetime
    model_config = {"from_attributes": True}


class StudyPlanToday(BaseModel):
    id: int
    topic: str
    description: str
    completed: bool
    plan_title: str = ""
    model_config = {"from_attributes": True}


class DashboardReview(BaseModel):
    due_flashcards: list[DueFlashcard] = []
    due_flashcard_count: int = 0
    weak_topics: list[WeakTopic] = []
    overdue_todos: list[OverdueTodo] = []
    upcoming_todos: list[OverdueTodo] = []
    stale_notes: list[StaleNote] = []
    study_plan_today: list[StudyPlanToday] = []
    current_streak: int = 0
