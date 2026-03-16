from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    vim_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    theme: Mapped[str] = mapped_column(String(10), default="dark", server_default="dark")
    editor_font_size: Mapped[str] = mapped_column(String(10), default="normal", server_default="normal")
    default_note_type: Mapped[str] = mapped_column(String(20), default="text", server_default="text")
    pomodoro_focus: Mapped[int] = mapped_column(Integer, default=25, server_default="25")
    pomodoro_short_break: Mapped[int] = mapped_column(Integer, default=5, server_default="5")
    pomodoro_long_break: Mapped[int] = mapped_column(Integer, default=15, server_default="15")
    created_at: Mapped[datetime] = mapped_column(default=func.now())
