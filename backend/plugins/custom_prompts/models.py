from __future__ import annotations
from datetime import datetime
from sqlalchemy import ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CustomPrompt(Base):
    __tablename__ = "plugin_custom_prompts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    label: Mapped[str] = mapped_column(String(200))
    prompt_template: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
