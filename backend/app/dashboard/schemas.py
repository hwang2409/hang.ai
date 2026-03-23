from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel


class WeeklyQuizAccuracy(BaseModel):
    week: str  # ISO date of week start (Monday)
    avg_pct: float
    count: int


class WeeklyFlashcardRetention(BaseModel):
    week: str
    retention_pct: float
    total: int


class WeeklyStudyMinutes(BaseModel):
    week: str
    minutes: int


class TrendsResponse(BaseModel):
    quiz_accuracy: list[WeeklyQuizAccuracy] = []
    flashcard_retention: list[WeeklyFlashcardRetention] = []
    study_minutes: list[WeeklyStudyMinutes] = []


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


class BriefItem(BaseModel):
    type: Literal[
        "flashcard_review",
        "quiz_retake",
        "overdue_todo",
        "study_plan",
        "feynman_retry",
        "stale_note",
        "upcoming_todo",
        "note_review",
    ]
    priority: Literal[1, 2, 3]
    title: str
    subtitle: str = ""
    link: str
    meta: dict = {}


class QuizBriefInfo(BaseModel):
    quiz_id: int
    quiz_title: str
    last_score_pct: int
    attempt_count: int


class TopicMastery(BaseModel):
    topic: str
    note_id: Optional[int] = None
    mastery_pct: float  # 0-100
    flashcard_ease: Optional[float] = None
    flashcard_count: int = 0
    quiz_avg_pct: Optional[float] = None
    quiz_attempts: int = 0
    feynman_score: Optional[int] = None


class TopicMasteryResponse(BaseModel):
    topics: list[TopicMastery] = []


class HabitInsight(BaseModel):
    category: str  # "timing", "consistency", "sessions", "performance"
    title: str     # short headline, e.g. "You study best in the afternoon"
    detail: str    # explanation


class HabitsResponse(BaseModel):
    insights: list[HabitInsight]
    study_days_last_30: int
    avg_daily_minutes: float


class DashboardReview(BaseModel):
    due_flashcards: list[DueFlashcard] = []
    due_flashcard_count: int = 0
    weak_topics: list[WeakTopic] = []
    overdue_todos: list[OverdueTodo] = []
    upcoming_todos: list[OverdueTodo] = []
    stale_notes: list[StaleNote] = []
    study_plan_today: list[StudyPlanToday] = []
    current_streak: int = 0
    quiz_retakes: list[QuizBriefInfo] = []
    brief_items: list[BriefItem] = []
    due_review_count: int = 0
    # Daily study brief
    greeting: str = ""
    study_next: Optional[BriefItem] = None
    estimated_minutes: int = 0
