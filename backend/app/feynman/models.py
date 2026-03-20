from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FeynmanSession(Base):
    __tablename__ = "feynman_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    topic: Mapped[str] = mapped_column(String(500))
    explanation: Mapped[str] = mapped_column(Text)
    score: Mapped[int] = mapped_column(default=0)  # 0-100
    strengths: Mapped[str] = mapped_column(Text, default="[]")  # JSON array
    weaknesses: Mapped[str] = mapped_column(Text, default="[]")  # JSON array
    feedback: Mapped[str] = mapped_column(Text, default="")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    note_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())


class SocraticSession(Base):
    __tablename__ = "socratic_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    topic: Mapped[str] = mapped_column(String(500))
    messages: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of {role, content}
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | completed
    question_count: Mapped[int] = mapped_column(default=0)
    score: Mapped[Optional[int]] = mapped_column(nullable=True)
    strengths: Mapped[str] = mapped_column(Text, default="[]")  # JSON array
    weaknesses: Mapped[str] = mapped_column(Text, default="[]")  # JSON array
    feedback: Mapped[str] = mapped_column(Text, default="")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    note_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
