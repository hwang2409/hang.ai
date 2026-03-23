from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ReviewSchedule(Base):
    __tablename__ = "review_schedules"
    __table_args__ = (
        UniqueConstraint("user_id", "item_type", "item_id", name="uq_review_user_type_item"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    item_type: Mapped[str] = mapped_column(String(20))  # "note" | "concept"
    item_id: Mapped[int] = mapped_column()  # NOT a FK
    item_label: Mapped[str] = mapped_column(String(500), default="")
    # SM-2 fields
    ease_factor: Mapped[float] = mapped_column(default=2.5)
    interval: Mapped[int] = mapped_column(default=0)  # days
    repetitions: Mapped[int] = mapped_column(default=0)
    next_review: Mapped[datetime] = mapped_column(default=func.now(), index=True)
    last_reviewed: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())
