import secrets
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_friendship"),
    )

    id = Column(Integer, primary_key=True)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    addressee_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="pending")  # pending, accepted, rejected
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class StudyGroup(Base):
    __tablename__ = "study_groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    invite_code = Column(String(32), unique=True, default=lambda: secrets.token_urlsafe(16))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    members = relationship("StudyGroupMember", back_populates="group", cascade="all, delete-orphan")


class StudyGroupMember(Base):
    __tablename__ = "study_group_members"
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_group_member"),
    )

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("study_groups.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), nullable=False, default="member")  # owner, member
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group = relationship("StudyGroup", back_populates="members")


class GroupMessage(Base):
    __tablename__ = "group_messages"
    __table_args__ = (
        Index("ix_group_messages_group_created", "group_id", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("study_groups.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey("group_messages.id"), nullable=True)
    message_type = Column(String(20), nullable=False, default="text")  # text, note_share, flashcard_share
    resource_id = Column(Integer, nullable=True)
    is_pinned = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class MessageReaction(Base):
    __tablename__ = "message_reactions"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", "emoji", name="uq_message_reaction"),
    )

    id = Column(Integer, primary_key=True)
    message_id = Column(Integer, ForeignKey("group_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    emoji = Column(String(10), nullable=False)


class DirectMessage(Base):
    __tablename__ = "direct_messages"
    __table_args__ = (
        Index("ix_dm_sender_recipient", "sender_id", "recipient_id"),
        Index("ix_dm_recipient_sender", "recipient_id", "sender_id"),
    )

    id = Column(Integer, primary_key=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    is_read = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class StudyRoom(Base):
    __tablename__ = "study_rooms"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("study_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    is_active = Column(Integer, default=1)
    focus_minutes = Column(Integer, default=25)
    break_minutes = Column(Integer, default=5)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class StudyRoomParticipant(Base):
    __tablename__ = "study_room_participants"
    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_room_participant"),
    )

    id = Column(Integer, primary_key=True)
    room_id = Column(Integer, ForeignKey("study_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="focusing")
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_ping = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class GroupSharedNote(Base):
    __tablename__ = "group_shared_notes"
    __table_args__ = (
        UniqueConstraint("group_id", "note_id", name="uq_group_shared_note"),
    )

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("study_groups.id", ondelete="CASCADE"), nullable=False)
    note_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    shared_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    permission = Column(String(10), default="view")  # view, edit, suggest
    shared_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class NoteSuggestion(Base):
    __tablename__ = "note_suggestions"

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    suggested_title = Column(String(500), nullable=True)
    suggested_content = Column(Text, nullable=False)
    status = Column(String(10), default="pending")  # pending, accepted, rejected
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    resolved_at = Column(DateTime, nullable=True)


class ActivityEvent(Base):
    __tablename__ = "activity_events"
    __table_args__ = (
        Index("ix_activity_user_created", "user_id", "created_at"),
        Index("ix_activity_group_created", "group_id", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    event_type = Column(String(30), nullable=False)  # study_session, flashcard_review, quiz_complete, note_created, note_shared
    detail_json = Column(Text, default="{}")
    group_id = Column(Integer, ForeignKey("study_groups.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
