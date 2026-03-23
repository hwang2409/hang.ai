from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ForumQuestion(Base):
    __tablename__ = "forum_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    tags: Mapped[str] = mapped_column(String(500), default="")
    linked_note_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("documents.id"), nullable=True
    )
    upvote_count: Mapped[int] = mapped_column(Integer, default=0)
    downvote_count: Mapped[int] = mapped_column(Integer, default=0)
    answer_count: Mapped[int] = mapped_column(Integer, default=0)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    is_answered: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open")
    duplicate_of_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("forum_questions.id"), nullable=True
    )
    bounty: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    bounty_expires_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())


class ForumAnswer(Base):
    __tablename__ = "forum_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("forum_questions.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    upvote_count: Mapped[int] = mapped_column(Integer, default=0)
    downvote_count: Mapped[int] = mapped_column(Integer, default=0)
    is_accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    is_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())


class ForumVote(Base):
    __tablename__ = "forum_votes"
    __table_args__ = (
        UniqueConstraint("user_id", "target_type", "target_id", name="uq_forum_vote"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    target_type: Mapped[str] = mapped_column(String(20))  # "question" or "answer"
    target_id: Mapped[int] = mapped_column(Integer)
    direction: Mapped[int] = mapped_column(Integer, default=1)  # 1=upvote, -1=downvote


class ForumComment(Base):
    __tablename__ = "forum_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    target_type: Mapped[str] = mapped_column(String(20))  # "question" or "answer"
    target_id: Mapped[int] = mapped_column(Integer, index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=func.now())


class ForumQuestionEmbedding(Base):
    __tablename__ = "forum_question_embeddings"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("forum_questions.id", ondelete="CASCADE"), unique=True, index=True
    )
    embedding: Mapped[str] = mapped_column(Text)  # JSON array of floats
    content_hash: Mapped[str] = mapped_column(String(64))


class ForumBookmark(Base):
    __tablename__ = "forum_bookmarks"
    __table_args__ = (
        UniqueConstraint("user_id", "question_id", name="uq_forum_bookmark"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("forum_questions.id", ondelete="CASCADE"), index=True
    )
