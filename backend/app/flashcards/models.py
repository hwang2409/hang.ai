from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FlashcardReview(Base):
    __tablename__ = "flashcard_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("flashcards.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    quality: Mapped[int] = mapped_column()  # 0-5 SM2 rating
    reviewed_at: Mapped[datetime] = mapped_column(default=func.now())


class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[int] = mapped_column(primary_key=True)
    front: Mapped[str] = mapped_column(Text)
    back: Mapped[str] = mapped_column(Text)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    note_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True)
    # SM-2 fields
    ease_factor: Mapped[float] = mapped_column(default=2.5)
    interval: Mapped[int] = mapped_column(default=0)  # days
    repetitions: Mapped[int] = mapped_column(default=0)
    next_review: Mapped[datetime] = mapped_column(default=func.now())
    last_reviewed: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())
