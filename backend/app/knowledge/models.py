from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserConcept(Base):
    __tablename__ = "user_concepts"
    __table_args__ = (UniqueConstraint("user_id", "normalized", name="uq_user_concept"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    concept: Mapped[str] = mapped_column(String(300))
    normalized: Mapped[str] = mapped_column(String(300))
    first_seen_at: Mapped[datetime] = mapped_column(default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(default=func.now())


class ConceptSource(Base):
    __tablename__ = "concept_sources"
    __table_args__ = (UniqueConstraint("concept_id", "document_id", name="uq_concept_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    concept_id: Mapped[int] = mapped_column(ForeignKey("user_concepts.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    source_type: Mapped[str] = mapped_column(String(20))  # "concept" or "prerequisite"
