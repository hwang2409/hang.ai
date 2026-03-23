from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    trigger_type: Mapped[str] = mapped_column(String(50), index=True)
    trigger_config: Mapped[str] = mapped_column(Text, default="{}")
    action_type: Mapped[str] = mapped_column(String(50))
    action_config: Mapped[str] = mapped_column(Text, default="{}")
    enabled: Mapped[bool] = mapped_column(default=True)
    trigger_count: Mapped[int] = mapped_column(default=0)
    last_triggered_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())


class AutomationLog(Base):
    __tablename__ = "automation_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("automation_rules.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    trigger_data: Mapped[str] = mapped_column(Text, default="{}")
    action_result: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(20))  # success | failed | skipped
    created_at: Mapped[datetime] = mapped_column(default=func.now())
