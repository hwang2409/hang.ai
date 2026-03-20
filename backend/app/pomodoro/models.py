from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class StudySession(Base):
    __tablename__ = "study_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    session_type: Mapped[str] = mapped_column(String(20), index=True)  # focus, short_break, long_break
    duration_minutes: Mapped[int] = mapped_column(Integer)  # actual duration
    planned_minutes: Mapped[int] = mapped_column(Integer)  # planned duration
    completed: Mapped[bool] = mapped_column(Boolean, default=True)
    note_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(default=func.now(), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
