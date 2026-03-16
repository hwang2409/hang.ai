from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class FlashcardCreate(BaseModel):
    front: str
    back: str
    note_id: Optional[int] = None


class FlashcardUpdate(BaseModel):
    front: Optional[str] = None
    back: Optional[str] = None


class FlashcardResponse(BaseModel):
    id: int
    front: str
    back: str
    note_id: Optional[int]
    ease_factor: float
    interval: int
    repetitions: int
    next_review: datetime
    last_reviewed: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReviewRequest(BaseModel):
    quality: int = Field(ge=0, le=5)


class ReviewResponse(BaseModel):
    id: int
    front: str
    back: str
    ease_factor: float
    interval: int
    repetitions: int
    next_review: datetime
    last_reviewed: Optional[datetime]

    model_config = {"from_attributes": True}


class GenerateRequest(BaseModel):
    note_id: int
    count: int = 10
    content_override: Optional[str] = None


class DuplicateInfo(BaseModel):
    front: str
    reason: str  # "exact_duplicate" | "semantic_duplicate"


class GenerateResponse(BaseModel):
    flashcards: list[FlashcardResponse]
    skipped: list[DuplicateInfo] = []


class StatsResponse(BaseModel):
    total: int
    due_today: int
    mastered: int
    learning: int


class WeakSpotCard(BaseModel):
    id: int
    front: str
    back: str
    ease_factor: float
    repetitions: int
    note_id: Optional[int] = None

    model_config = {"from_attributes": True}


class WeakSpotGroup(BaseModel):
    note_id: Optional[int] = None
    note_title: str
    cards: list[WeakSpotCard]
    avg_ease: float


class WeakSpotsResponse(BaseModel):
    groups: list[WeakSpotGroup]
    total: int
