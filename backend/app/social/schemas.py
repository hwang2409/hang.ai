from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ── Friends ───────────────────────────────────────────────────────────────────

class FriendAddRequest(BaseModel):
    username: str


class FriendRequestResponse(BaseModel):
    id: int
    requester_id: int
    requester_username: str
    created_at: datetime

    model_config = {"from_attributes": True}


class OutgoingRequestResponse(BaseModel):
    id: int
    addressee_id: int
    addressee_username: str
    created_at: datetime

    model_config = {"from_attributes": True}


class WeeklyStats(BaseModel):
    study_minutes: int = 0
    streak: int = 0


class FriendResponse(BaseModel):
    user_id: int
    username: str
    weekly_stats: WeeklyStats

    model_config = {"from_attributes": True}


class UserSearchResult(BaseModel):
    id: int
    username: str

    model_config = {"from_attributes": True}


# ── Groups ────────────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None


class GroupMemberResponse(BaseModel):
    user_id: int
    username: str
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class GroupResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    invite_code: str
    created_by: int
    member_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupDetailResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    invite_code: str
    created_by: int
    members: list[GroupMemberResponse] = []
    shared_note_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupInviteRequest(BaseModel):
    username: str


class GroupJoinRequest(BaseModel):
    invite_code: str


# ── Messages ──────────────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str
    parent_id: Optional[int] = None
    message_type: str = "text"
    resource_id: Optional[int] = None


class ReactionCount(BaseModel):
    emoji: str
    count: int
    user_reacted: bool = False


class MessageResponse(BaseModel):
    id: int
    group_id: int
    user_id: int
    username: str
    content: str
    parent_id: Optional[int] = None
    message_type: str = "text"
    resource_id: Optional[int] = None
    reply_count: int = 0
    is_pinned: bool = False
    reactions: list[ReactionCount] = []
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Direct Messages ─────────────────────────────────────────────────────────

class DMCreate(BaseModel):
    body: str


class DMResponse(BaseModel):
    id: int
    sender_id: int
    sender_username: str
    recipient_id: int
    recipient_username: str
    body: str
    is_read: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationSummary(BaseModel):
    user_id: int
    username: str
    last_message: str
    unread_count: int = 0
    last_message_at: datetime

    model_config = {"from_attributes": True}


# ── Study Rooms ──────────────────────────────────────────────────────────────

class StudyRoomCreate(BaseModel):
    name: str
    focus_minutes: int = 25
    break_minutes: int = 5


class StudyRoomParticipantResponse(BaseModel):
    user_id: int
    username: str
    status: str = "focusing"
    is_online: bool = True
    joined_at: datetime

    model_config = {"from_attributes": True}


class StudyRoomResponse(BaseModel):
    id: int
    group_id: int
    name: str
    is_active: bool = True
    focus_minutes: int = 25
    break_minutes: int = 5
    created_by: int
    participants: list[StudyRoomParticipantResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class PingRequest(BaseModel):
    status: str = "focusing"


# ── Shared Notes ──────────────────────────────────────────────────────────────

class ShareNoteRequest(BaseModel):
    note_id: int
    permission: str = "view"


class SharedNoteResponse(BaseModel):
    id: int
    group_id: int
    note_id: int
    note_title: str
    shared_by: int
    shared_by_username: str
    permission: str = "view"
    shared_at: datetime

    model_config = {"from_attributes": True}


class SuggestionCreate(BaseModel):
    suggested_title: Optional[str] = None
    suggested_content: str


class SuggestionResponse(BaseModel):
    id: int
    document_id: int
    user_id: int
    username: str
    suggested_title: Optional[str] = None
    suggested_content: str
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Feed & Leaderboard ───────────────────────────────────────────────────────

class ActivityEventResponse(BaseModel):
    id: int
    user_id: int
    username: str
    event_type: str
    detail_json: str = "{}"
    group_id: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LeaderboardEntry(BaseModel):
    user_id: int
    username: str
    study_minutes: int = 0
    streak: int = 0
    retention_pct: float = 0.0

    model_config = {"from_attributes": True}


class FlashcardStatEntry(BaseModel):
    user_id: int
    username: str
    total_reviews: int = 0
    correct_reviews: int = 0
    accuracy_pct: float = 0.0

    model_config = {"from_attributes": True}
