from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Text, String, Float, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FileAnnotation(Base):
    __tablename__ = "file_annotations"

    id: Mapped[int] = mapped_column(primary_key=True)
    file_id: Mapped[int] = mapped_column(ForeignKey("uploaded_files.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    annotation_type: Mapped[str] = mapped_column(String(20))  # "text_selection" or "timestamp"
    selected_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    annotation_content: Mapped[str] = mapped_column(Text, default="")
    page_number: Mapped[Optional[int]] = mapped_column(nullable=True)
    timestamp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    color: Mapped[str] = mapped_column(String(32), default="default")
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())
