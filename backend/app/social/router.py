import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, select, func as sa_func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document
from app.flashcards.models import Flashcard, FlashcardReview
from app.pomodoro.models import StudySession
from app.notifications.helpers import create_notification
from app.social.models import (
    ActivityEvent,
    DirectMessage,
    Friendship,
    GroupMessage,
    GroupSharedNote,
    MessageReaction,
    StudyGroup,
    StudyGroupMember,
    StudyRoom,
    StudyRoomParticipant,
)
from app.social.schemas import (
    ActivityEventResponse,
    ConversationSummary,
    DMCreate,
    DMResponse,
    FlashcardStatEntry,
    FriendAddRequest,
    FriendRequestResponse,
    FriendResponse,
    OutgoingRequestResponse,
    GroupCreate,
    GroupDetailResponse,
    GroupInviteRequest,
    GroupJoinRequest,
    GroupMemberResponse,
    GroupResponse,
    LeaderboardEntry,
    MessageCreate,
    MessageResponse,
    PingRequest,
    ReactionCount,
    ShareNoteRequest,
    SharedNoteResponse,
    StudyRoomCreate,
    StudyRoomParticipantResponse,
    StudyRoomResponse,
    UserSearchResult,
    WeeklyStats,
)

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _require_group_member(db: AsyncSession, group_id: int, user_id: int) -> StudyGroupMember:
    result = await db.execute(
        select(StudyGroupMember).where(
            StudyGroupMember.group_id == group_id,
            StudyGroupMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this group")
    return member


async def _get_weekly_stats(db: AsyncSession, user_id: int) -> WeeklyStats:
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=7)

    result = await db.execute(
        select(sa_func.coalesce(sa_func.sum(StudySession.duration_minutes), 0)).where(
            StudySession.user_id == user_id,
            StudySession.session_type == "focus",
            StudySession.completed == True,  # noqa: E712
            StudySession.started_at >= week_start,
        )
    )
    minutes = result.scalar() or 0

    # Streak
    streak = 0
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    check_date = today_start
    for _ in range(365):
        day_end = check_date + timedelta(days=1)
        r = await db.execute(
            select(sa_func.count(StudySession.id)).where(
                StudySession.user_id == user_id,
                StudySession.session_type == "focus",
                StudySession.completed == True,  # noqa: E712
                StudySession.started_at >= check_date,
                StudySession.started_at < day_end,
            )
        )
        count = r.scalar()
        if count and count > 0:
            streak += 1
            check_date -= timedelta(days=1)
        else:
            if check_date == today_start and streak == 0:
                check_date -= timedelta(days=1)
                continue
            break

    return WeeklyStats(study_minutes=minutes, streak=streak)


async def _batch_fetch_reactions(db: AsyncSession, msg_ids: list[int], current_user_id: int) -> dict[int, list[ReactionCount]]:
    if not msg_ids:
        return {}
    result = await db.execute(
        select(
            MessageReaction.message_id,
            MessageReaction.emoji,
            sa_func.count(MessageReaction.id).label("cnt"),
            sa_func.max(case((MessageReaction.user_id == current_user_id, 1), else_=0)).label("user_reacted"),
        )
        .where(MessageReaction.message_id.in_(msg_ids))
        .group_by(MessageReaction.message_id, MessageReaction.emoji)
    )
    rows = result.all()
    reactions_map: dict[int, list[ReactionCount]] = {}
    for msg_id, emoji, cnt, user_reacted in rows:
        if msg_id not in reactions_map:
            reactions_map[msg_id] = []
        reactions_map[msg_id].append(ReactionCount(emoji=emoji, count=cnt, user_reacted=bool(user_reacted)))
    return reactions_map


async def _get_friend_ids(db: AsyncSession, user_id: int) -> list[int]:
    result = await db.execute(
        select(Friendship).where(
            Friendship.status == "accepted",
            or_(
                Friendship.requester_id == user_id,
                Friendship.addressee_id == user_id,
            ),
        )
    )
    friendships = result.scalars().all()
    ids = []
    for f in friendships:
        ids.append(f.addressee_id if f.requester_id == user_id else f.requester_id)
    return ids


# ── Friends ───────────────────────────────────────────────────────────────────

@router.get("/friends", response_model=list[FriendResponse])
async def list_friends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    friend_ids = await _get_friend_ids(db, current_user.id)
    if not friend_ids:
        return []

    result = await db.execute(select(User).where(User.id.in_(friend_ids)))
    users = result.scalars().all()

    friends = []
    for u in users:
        stats = await _get_weekly_stats(db, u.id)
        friends.append(FriendResponse(user_id=u.id, username=u.username, weekly_stats=stats))
    return friends


@router.get("/friends/requests", response_model=list[FriendRequestResponse])
async def list_friend_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Friendship, User.username)
        .join(User, Friendship.requester_id == User.id)
        .where(
            Friendship.addressee_id == current_user.id,
            Friendship.status == "pending",
        )
        .order_by(Friendship.created_at.desc())
    )
    rows = result.all()
    return [
        FriendRequestResponse(
            id=f.id,
            requester_id=f.requester_id,
            requester_username=username,
            created_at=f.created_at,
        )
        for f, username in rows
    ]


@router.get("/friends/outgoing", response_model=list[OutgoingRequestResponse])
async def list_outgoing_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Friendship, User.username)
        .join(User, Friendship.addressee_id == User.id)
        .where(
            Friendship.requester_id == current_user.id,
            Friendship.status == "pending",
        )
        .order_by(Friendship.created_at.desc())
    )
    rows = result.all()
    return [
        OutgoingRequestResponse(
            id=f.id,
            addressee_id=f.addressee_id,
            addressee_username=username,
            created_at=f.created_at,
        )
        for f, username in rows
    ]


@router.post("/friends/add", status_code=status.HTTP_201_CREATED)
async def send_friend_request(
    body: FriendAddRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.username.lower() == current_user.username.lower():
        raise HTTPException(status_code=400, detail="Cannot add yourself")

    result = await db.execute(select(User).where(User.username == body.username))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Check existing friendship in either direction
    result = await db.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.requester_id == current_user.id, Friendship.addressee_id == target.id),
                and_(Friendship.requester_id == target.id, Friendship.addressee_id == current_user.id),
            )
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        if existing.status == "accepted":
            raise HTTPException(status_code=400, detail="Already friends")
        if existing.status == "pending":
            raise HTTPException(status_code=400, detail="Friend request already pending")
        if existing.status == "rejected":
            existing.status = "pending"
            existing.requester_id = current_user.id
            existing.addressee_id = target.id
            existing.updated_at = datetime.now(timezone.utc)
            await db.commit()
            create_notification(db, target.id, "friend_request", f"{current_user.username} sent you a friend request", link="/groups")
            await db.commit()
            return {"detail": "Friend request sent"}

    friendship = Friendship(requester_id=current_user.id, addressee_id=target.id)
    db.add(friendship)
    await db.commit()
    create_notification(db, target.id, "friend_request", f"{current_user.username} sent you a friend request", link="/groups")
    await db.commit()
    return {"detail": "Friend request sent"}


@router.post("/friends/{friendship_id}/accept")
async def accept_friend_request(
    friendship_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Friendship).where(
            Friendship.id == friendship_id,
            Friendship.addressee_id == current_user.id,
            Friendship.status == "pending",
        )
    )
    friendship = result.scalar_one_or_none()
    if not friendship:
        raise HTTPException(status_code=404, detail="Friend request not found")

    friendship.status = "accepted"
    friendship.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"detail": "Friend request accepted"}


@router.post("/friends/{friendship_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_friend_request(
    friendship_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Friendship).where(
            Friendship.id == friendship_id,
            Friendship.addressee_id == current_user.id,
            Friendship.status == "pending",
        )
    )
    friendship = result.scalar_one_or_none()
    if not friendship:
        raise HTTPException(status_code=404, detail="Friend request not found")

    friendship.status = "rejected"
    friendship.updated_at = datetime.now(timezone.utc)
    await db.commit()


@router.delete("/friends/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unfriend(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Friendship).where(
            Friendship.status == "accepted",
            or_(
                and_(Friendship.requester_id == current_user.id, Friendship.addressee_id == user_id),
                and_(Friendship.requester_id == user_id, Friendship.addressee_id == current_user.id),
            ),
        )
    )
    friendship = result.scalar_one_or_none()
    if not friendship:
        raise HTTPException(status_code=404, detail="Friendship not found")

    await db.delete(friendship)
    await db.commit()


@router.get("/friends/search", response_model=list[UserSearchResult])
async def search_users(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(User)
        .where(
            User.username.ilike(f"{q}%"),
            User.id != current_user.id,
        )
        .limit(20)
    )
    users = result.scalars().all()
    return [UserSearchResult(id=u.id, username=u.username) for u in users]


# ── Groups ────────────────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[GroupResponse])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StudyGroup, sa_func.count(StudyGroupMember.id).label("member_count"))
        .join(StudyGroupMember, StudyGroup.id == StudyGroupMember.group_id)
        .where(
            StudyGroup.id.in_(
                select(StudyGroupMember.group_id).where(StudyGroupMember.user_id == current_user.id)
            )
        )
        .group_by(StudyGroup.id)
        .order_by(StudyGroup.created_at.desc())
    )
    rows = result.all()
    return [
        GroupResponse(
            id=g.id,
            name=g.name,
            description=g.description,
            invite_code=g.invite_code,
            created_by=g.created_by,
            member_count=count,
            created_at=g.created_at,
        )
        for g, count in rows
    ]


@router.post("/groups", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    body: GroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = StudyGroup(
        name=body.name,
        description=body.description,
        created_by=current_user.id,
    )
    db.add(group)
    await db.flush()

    member = StudyGroupMember(group_id=group.id, user_id=current_user.id, role="owner")
    db.add(member)
    await db.commit()
    await db.refresh(group)

    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        invite_code=group.invite_code,
        created_by=group.created_by,
        member_count=1,
        created_at=group.created_at,
    )


@router.get("/groups/{group_id}", response_model=GroupDetailResponse)
async def get_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    result = await db.execute(select(StudyGroup).where(StudyGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Members
    result = await db.execute(
        select(StudyGroupMember, User.username)
        .join(User, StudyGroupMember.user_id == User.id)
        .where(StudyGroupMember.group_id == group_id)
    )
    members = [
        GroupMemberResponse(user_id=m.user_id, username=username, role=m.role, joined_at=m.joined_at)
        for m, username in result.all()
    ]

    # Shared note count
    result = await db.execute(
        select(sa_func.count(GroupSharedNote.id)).where(GroupSharedNote.group_id == group_id)
    )
    shared_note_count = result.scalar() or 0

    return GroupDetailResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        invite_code=group.invite_code,
        created_by=group.created_by,
        members=members,
        shared_note_count=shared_note_count,
        created_at=group.created_at,
    )


@router.post("/groups/{group_id}/invite")
async def invite_to_group(
    group_id: int,
    body: GroupInviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    result = await db.execute(select(User).where(User.username == body.username))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already a member
    result = await db.execute(
        select(StudyGroupMember).where(
            StudyGroupMember.group_id == group_id,
            StudyGroupMember.user_id == target.id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a member")

    member = StudyGroupMember(group_id=group_id, user_id=target.id, role="member")
    db.add(member)
    await db.commit()
    # Get group name for notification
    g_result = await db.execute(select(StudyGroup).where(StudyGroup.id == group_id))
    group = g_result.scalar_one_or_none()
    group_name = group.name if group else "a group"
    create_notification(db, target.id, "group_invite", f"{current_user.username} added you to {group_name}", link=f"/groups/{group_id}")
    await db.commit()
    return {"detail": f"{body.username} added to group"}


@router.post("/groups/join", response_model=GroupResponse)
async def join_group(
    body: GroupJoinRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StudyGroup).where(StudyGroup.invite_code == body.invite_code)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    # Check if already a member
    result = await db.execute(
        select(StudyGroupMember).where(
            StudyGroupMember.group_id == group.id,
            StudyGroupMember.user_id == current_user.id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already a member")

    member = StudyGroupMember(group_id=group.id, user_id=current_user.id, role="member")
    db.add(member)
    await db.commit()

    # Get member count
    result = await db.execute(
        select(sa_func.count(StudyGroupMember.id)).where(StudyGroupMember.group_id == group.id)
    )
    count = result.scalar() or 0

    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        invite_code=group.invite_code,
        created_by=group.created_by,
        member_count=count,
        created_at=group.created_at,
    )


@router.delete("/groups/{group_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = await _require_group_member(db, group_id, current_user.id)
    if member.role == "owner":
        raise HTTPException(status_code=400, detail="Owner cannot leave. Delete the group instead.")
    await db.delete(member)
    await db.commit()


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(StudyGroup).where(StudyGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete this group")

    await db.delete(group)
    await db.commit()


# ── Forum Messages ────────────────────────────────────────────────────────────

@router.get("/groups/{group_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    group_id: int,
    before: int | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    stmt = (
        select(GroupMessage, User.username)
        .join(User, GroupMessage.user_id == User.id)
        .where(
            GroupMessage.group_id == group_id,
            GroupMessage.parent_id.is_(None),
        )
    )
    if before is not None:
        stmt = stmt.where(GroupMessage.id < before)
    stmt = stmt.order_by(GroupMessage.created_at.desc()).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()

    # Batch-fetch reply counts
    msg_ids = [m.id for m, _ in rows]
    reply_counts: dict[int, int] = {}
    if msg_ids:
        rc_result = await db.execute(
            select(GroupMessage.parent_id, sa_func.count(GroupMessage.id))
            .where(GroupMessage.parent_id.in_(msg_ids))
            .group_by(GroupMessage.parent_id)
        )
        reply_counts = dict(rc_result.all())

    reactions_map = await _batch_fetch_reactions(db, msg_ids, current_user.id)

    return [
        MessageResponse(
            id=m.id,
            group_id=m.group_id,
            user_id=m.user_id,
            username=username,
            content=m.content,
            parent_id=m.parent_id,
            message_type=m.message_type,
            resource_id=m.resource_id,
            is_pinned=bool(getattr(m, 'is_pinned', 0)),
            reactions=reactions_map.get(m.id, []),
            reply_count=reply_counts.get(m.id, 0),
            created_at=m.created_at,
        )
        for m, username in reversed(rows)
    ]


@router.post("/groups/{group_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def post_message(
    group_id: int,
    body: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    msg = GroupMessage(
        group_id=group_id,
        user_id=current_user.id,
        content=body.content,
        parent_id=body.parent_id,
        message_type=body.message_type,
        resource_id=body.resource_id,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    return MessageResponse(
        id=msg.id,
        group_id=msg.group_id,
        user_id=msg.user_id,
        username=current_user.username,
        content=msg.content,
        parent_id=msg.parent_id,
        message_type=msg.message_type,
        resource_id=msg.resource_id,
        created_at=msg.created_at,
    )


@router.delete("/groups/{group_id}/messages/{msg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    group_id: int,
    msg_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(GroupMessage).where(
            GroupMessage.id == msg_id,
            GroupMessage.group_id == group_id,
            GroupMessage.user_id == current_user.id,
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    await db.delete(msg)
    await db.commit()


@router.get("/groups/{group_id}/messages/{msg_id}/replies", response_model=list[MessageResponse])
async def get_replies(
    group_id: int,
    msg_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    result = await db.execute(
        select(GroupMessage, User.username)
        .join(User, GroupMessage.user_id == User.id)
        .where(
            GroupMessage.group_id == group_id,
            GroupMessage.parent_id == msg_id,
        )
        .order_by(GroupMessage.created_at.asc())
    )
    rows = result.all()
    reply_msg_ids = [m.id for m, _ in rows]
    reactions_map = await _batch_fetch_reactions(db, reply_msg_ids, current_user.id)
    return [
        MessageResponse(
            id=m.id,
            group_id=m.group_id,
            user_id=m.user_id,
            username=username,
            content=m.content,
            parent_id=m.parent_id,
            message_type=m.message_type,
            resource_id=m.resource_id,
            is_pinned=bool(getattr(m, 'is_pinned', 0)),
            reactions=reactions_map.get(m.id, []),
            created_at=m.created_at,
        )
        for m, username in rows
    ]


# ── Shared Resources ─────────────────────────────────────────────────────────

@router.post("/groups/{group_id}/share-note", response_model=SharedNoteResponse, status_code=status.HTTP_201_CREATED)
async def share_note(
    group_id: int,
    body: ShareNoteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    # Verify note belongs to user
    result = await db.execute(
        select(Document).where(Document.id == body.note_id, Document.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Validate permission
    if body.permission not in ("view", "edit", "suggest"):
        raise HTTPException(status_code=400, detail="Permission must be view, edit, or suggest")

    # Check if already shared
    result = await db.execute(
        select(GroupSharedNote).where(
            GroupSharedNote.group_id == group_id,
            GroupSharedNote.note_id == body.note_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Note already shared in this group")

    shared = GroupSharedNote(
        group_id=group_id,
        note_id=body.note_id,
        shared_by=current_user.id,
        permission=body.permission,
    )
    db.add(shared)

    # Auto-post forum message
    msg = GroupMessage(
        group_id=group_id,
        user_id=current_user.id,
        content=f"Shared note: **{note.title or 'Untitled'}** ({body.permission} access)",
        message_type="note_share",
        resource_id=body.note_id,
    )
    db.add(msg)

    await db.commit()
    await db.refresh(shared)

    return SharedNoteResponse(
        id=shared.id,
        group_id=shared.group_id,
        note_id=shared.note_id,
        note_title=note.title or "Untitled",
        shared_by=shared.shared_by,
        shared_by_username=current_user.username,
        permission=shared.permission or "view",
        shared_at=shared.shared_at,
    )


@router.get("/groups/{group_id}/shared-notes", response_model=list[SharedNoteResponse])
async def list_shared_notes(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    result = await db.execute(
        select(GroupSharedNote, Document.title, User.username)
        .join(Document, GroupSharedNote.note_id == Document.id)
        .join(User, GroupSharedNote.shared_by == User.id)
        .where(GroupSharedNote.group_id == group_id)
        .order_by(GroupSharedNote.shared_at.desc())
    )
    rows = result.all()
    return [
        SharedNoteResponse(
            id=s.id,
            group_id=s.group_id,
            note_id=s.note_id,
            note_title=title or "Untitled",
            shared_by=s.shared_by,
            shared_by_username=username,
            permission=s.permission or "view",
            shared_at=s.shared_at,
        )
        for s, title, username in rows
    ]


@router.delete("/groups/{group_id}/shared-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unshare_note(
    group_id: int,
    note_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(GroupSharedNote).where(
            GroupSharedNote.group_id == group_id,
            GroupSharedNote.note_id == note_id,
            GroupSharedNote.shared_by == current_user.id,
        )
    )
    shared = result.scalar_one_or_none()
    if not shared:
        raise HTTPException(status_code=404, detail="Shared note not found")

    await db.delete(shared)
    await db.commit()


@router.get("/groups/{group_id}/flashcard-stats", response_model=list[FlashcardStatEntry])
async def group_flashcard_stats(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    # Get members
    result = await db.execute(
        select(StudyGroupMember.user_id, User.username)
        .join(User, StudyGroupMember.user_id == User.id)
        .where(StudyGroupMember.group_id == group_id)
    )
    members = result.all()

    # Get shared note IDs in this group
    result = await db.execute(
        select(GroupSharedNote.note_id).where(GroupSharedNote.group_id == group_id)
    )
    shared_note_ids = [r[0] for r in result.all()]

    stats = []
    for uid, username in members:
        if shared_note_ids:
            # Get flashcard IDs for shared notes owned by this user
            result = await db.execute(
                select(Flashcard.id).where(
                    Flashcard.user_id == uid,
                    Flashcard.note_id.in_(shared_note_ids),
                )
            )
            card_ids = [r[0] for r in result.all()]

            if card_ids:
                result = await db.execute(
                    select(
                        sa_func.count(FlashcardReview.id),
                        sa_func.sum(
                            case(
                                (FlashcardReview.quality >= 3, 1),
                                else_=0,
                            )
                        ),
                    ).where(FlashcardReview.card_id.in_(card_ids))
                )
                total_reviews, correct = result.one()
                total_reviews = total_reviews or 0
                correct = correct or 0
            else:
                total_reviews, correct = 0, 0
        else:
            total_reviews, correct = 0, 0

        accuracy = round((correct / total_reviews * 100), 1) if total_reviews > 0 else 0.0
        stats.append(FlashcardStatEntry(
            user_id=uid,
            username=username,
            total_reviews=total_reviews,
            correct_reviews=correct,
            accuracy_pct=accuracy,
        ))

    return stats


# ── Feed & Leaderboard ───────────────────────────────────────────────────────

@router.get("/feed", response_model=list[ActivityEventResponse])
async def get_feed(
    limit: int = Query(20, ge=1, le=100),
    before: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    friend_ids = await _get_friend_ids(db, current_user.id)

    # Get group IDs user belongs to
    result = await db.execute(
        select(StudyGroupMember.group_id).where(StudyGroupMember.user_id == current_user.id)
    )
    group_ids = [r[0] for r in result.all()]

    # Build filter: events from friends OR from user's groups
    filters = []
    if friend_ids:
        filters.append(ActivityEvent.user_id.in_(friend_ids))
    if group_ids:
        filters.append(ActivityEvent.group_id.in_(group_ids))
    # Always include own events
    filters.append(ActivityEvent.user_id == current_user.id)

    stmt = (
        select(ActivityEvent, User.username)
        .join(User, ActivityEvent.user_id == User.id)
        .where(or_(*filters))
    )
    if before is not None:
        stmt = stmt.where(ActivityEvent.id < before)
    stmt = stmt.order_by(ActivityEvent.created_at.desc()).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()
    return [
        ActivityEventResponse(
            id=e.id,
            user_id=e.user_id,
            username=username,
            event_type=e.event_type,
            detail_json=e.detail_json,
            group_id=e.group_id,
            created_at=e.created_at,
        )
        for e, username in rows
    ]


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(
    period: str = Query("week"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    friend_ids = await _get_friend_ids(db, current_user.id)
    all_ids = friend_ids + [current_user.id]

    now = datetime.now(timezone.utc)
    if period == "month":
        since = now - timedelta(days=30)
    else:
        since = now - timedelta(days=7)

    result = await db.execute(select(User).where(User.id.in_(all_ids)))
    users = result.scalars().all()

    entries = []
    for u in users:
        # Study minutes
        r = await db.execute(
            select(sa_func.coalesce(sa_func.sum(StudySession.duration_minutes), 0)).where(
                StudySession.user_id == u.id,
                StudySession.session_type == "focus",
                StudySession.completed == True,  # noqa: E712
                StudySession.started_at >= since,
            )
        )
        minutes = r.scalar() or 0

        stats = await _get_weekly_stats(db, u.id)

        # Retention: flashcard reviews with quality >= 3
        r = await db.execute(
            select(
                sa_func.count(FlashcardReview.id),
                sa_func.sum(case((FlashcardReview.quality >= 3, 1), else_=0)),
            ).where(
                FlashcardReview.user_id == u.id,
                FlashcardReview.reviewed_at >= since,
            )
        )
        total_reviews, correct = r.one()
        total_reviews = total_reviews or 0
        correct = correct or 0
        retention = round((correct / total_reviews * 100), 1) if total_reviews > 0 else 0.0

        entries.append(LeaderboardEntry(
            user_id=u.id,
            username=u.username,
            study_minutes=minutes,
            streak=stats.streak,
            retention_pct=retention,
        ))

    entries.sort(key=lambda e: e.study_minutes, reverse=True)
    return entries


@router.get("/groups/{group_id}/leaderboard", response_model=list[LeaderboardEntry])
async def get_group_leaderboard(
    group_id: int,
    period: str = Query("week"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    now = datetime.now(timezone.utc)
    if period == "month":
        since = now - timedelta(days=30)
    else:
        since = now - timedelta(days=7)

    # Get members
    result = await db.execute(
        select(StudyGroupMember.user_id, User.username)
        .join(User, StudyGroupMember.user_id == User.id)
        .where(StudyGroupMember.group_id == group_id)
    )
    members = result.all()

    entries = []
    for uid, username in members:
        r = await db.execute(
            select(sa_func.coalesce(sa_func.sum(StudySession.duration_minutes), 0)).where(
                StudySession.user_id == uid,
                StudySession.session_type == "focus",
                StudySession.completed == True,  # noqa: E712
                StudySession.started_at >= since,
            )
        )
        minutes = r.scalar() or 0

        stats = await _get_weekly_stats(db, uid)

        r = await db.execute(
            select(
                sa_func.count(FlashcardReview.id),
                sa_func.sum(case((FlashcardReview.quality >= 3, 1), else_=0)),
            ).where(
                FlashcardReview.user_id == uid,
                FlashcardReview.reviewed_at >= since,
            )
        )
        total_reviews, correct = r.one()
        total_reviews = total_reviews or 0
        correct = correct or 0
        retention = round((correct / total_reviews * 100), 1) if total_reviews > 0 else 0.0

        entries.append(LeaderboardEntry(
            user_id=uid,
            username=username,
            study_minutes=minutes,
            streak=stats.streak,
            retention_pct=retention,
        ))

    entries.sort(key=lambda e: e.study_minutes, reverse=True)
    return entries


# ── Message Reactions ────────────────────────────────────────────────────────

ALLOWED_EMOJIS = {"\U0001f44d", "\u2764\ufe0f", "\U0001f4a1", "\U0001f389", "\u2705"}


@router.post("/groups/{group_id}/messages/{msg_id}/react")
async def react_to_message(
    group_id: int,
    msg_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    emoji = body.get("emoji", "")
    if emoji not in ALLOWED_EMOJIS:
        raise HTTPException(status_code=400, detail="Invalid emoji")

    # Verify message exists in this group
    msg_result = await db.execute(
        select(GroupMessage).where(GroupMessage.id == msg_id, GroupMessage.group_id == group_id)
    )
    if not msg_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Message not found")

    # Toggle reaction
    result = await db.execute(
        select(MessageReaction).where(
            MessageReaction.message_id == msg_id,
            MessageReaction.user_id == current_user.id,
            MessageReaction.emoji == emoji,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
        return {"detail": "Reaction removed"}
    else:
        db.add(MessageReaction(message_id=msg_id, user_id=current_user.id, emoji=emoji))
        await db.commit()
        return {"detail": "Reaction added"}


# ── Pinned Messages ──────────────────────────────────────────────────────────

@router.post("/groups/{group_id}/messages/{msg_id}/pin")
async def pin_message(
    group_id: int,
    msg_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = await _require_group_member(db, group_id, current_user.id)

    result = await db.execute(
        select(GroupMessage).where(GroupMessage.id == msg_id, GroupMessage.group_id == group_id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # Only owner or message author can pin
    if member.role != "owner" and msg.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the group owner or message author can pin")

    msg.is_pinned = 1
    await db.commit()
    return {"detail": "Message pinned"}


@router.post("/groups/{group_id}/messages/{msg_id}/unpin")
async def unpin_message(
    group_id: int,
    msg_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = await _require_group_member(db, group_id, current_user.id)

    result = await db.execute(
        select(GroupMessage).where(GroupMessage.id == msg_id, GroupMessage.group_id == group_id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    if member.role != "owner" and msg.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the group owner or message author can unpin")

    msg.is_pinned = 0
    await db.commit()
    return {"detail": "Message unpinned"}


@router.get("/groups/{group_id}/pinned-messages", response_model=list[MessageResponse])
async def list_pinned_messages(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    result = await db.execute(
        select(GroupMessage, User.username)
        .join(User, GroupMessage.user_id == User.id)
        .where(GroupMessage.group_id == group_id, GroupMessage.is_pinned == 1)
        .order_by(GroupMessage.created_at.desc())
    )
    rows = result.all()

    msg_ids = [m.id for m, _ in rows]
    reactions_map = await _batch_fetch_reactions(db, msg_ids, current_user.id)

    return [
        MessageResponse(
            id=m.id,
            group_id=m.group_id,
            user_id=m.user_id,
            username=username,
            content=m.content,
            parent_id=m.parent_id,
            message_type=m.message_type,
            resource_id=m.resource_id,
            is_pinned=bool(m.is_pinned),
            reactions=reactions_map.get(m.id, []),
            created_at=m.created_at,
        )
        for m, username in rows
    ]


# ── Direct Messages ──────────────────────────────────────────────────────────

@router.get("/dm/conversations", response_model=list[ConversationSummary])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Get all users we have DMs with
    from sqlalchemy import union_all, literal_column

    sent = select(DirectMessage.recipient_id.label("other_id")).where(DirectMessage.sender_id == current_user.id)
    received = select(DirectMessage.sender_id.label("other_id")).where(DirectMessage.recipient_id == current_user.id)

    combined = union_all(sent, received).subquery()
    result = await db.execute(select(combined.c.other_id).distinct())
    other_ids = [r[0] for r in result.all()]

    if not other_ids:
        return []

    conversations = []
    for other_id in other_ids:
        # Get username
        u_result = await db.execute(select(User.username).where(User.id == other_id))
        username = u_result.scalar_one_or_none()
        if not username:
            continue

        # Get last message
        last_msg_result = await db.execute(
            select(DirectMessage)
            .where(
                or_(
                    and_(DirectMessage.sender_id == current_user.id, DirectMessage.recipient_id == other_id),
                    and_(DirectMessage.sender_id == other_id, DirectMessage.recipient_id == current_user.id),
                )
            )
            .order_by(DirectMessage.created_at.desc())
            .limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()
        if not last_msg:
            continue

        # Count unread
        unread_result = await db.execute(
            select(sa_func.count(DirectMessage.id)).where(
                DirectMessage.sender_id == other_id,
                DirectMessage.recipient_id == current_user.id,
                DirectMessage.is_read == 0,
            )
        )
        unread = unread_result.scalar() or 0

        conversations.append(ConversationSummary(
            user_id=other_id,
            username=username,
            last_message=last_msg.body[:100],
            unread_count=unread,
            last_message_at=last_msg.created_at,
        ))

    conversations.sort(key=lambda c: c.last_message_at, reverse=True)
    return conversations


@router.get("/dm/{user_id}", response_model=list[DMResponse])
async def get_dm_thread(
    user_id: int,
    before: int | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(DirectMessage)
        .where(
            or_(
                and_(DirectMessage.sender_id == current_user.id, DirectMessage.recipient_id == user_id),
                and_(DirectMessage.sender_id == user_id, DirectMessage.recipient_id == current_user.id),
            )
        )
    )
    if before is not None:
        stmt = stmt.where(DirectMessage.id < before)
    stmt = stmt.order_by(DirectMessage.created_at.desc()).limit(limit)

    result = await db.execute(stmt)
    msgs = result.scalars().all()

    # Get usernames
    user_result = await db.execute(select(User).where(User.id.in_([current_user.id, user_id])))
    users = {u.id: u.username for u in user_result.scalars().all()}

    return [
        DMResponse(
            id=m.id,
            sender_id=m.sender_id,
            sender_username=users.get(m.sender_id, ""),
            recipient_id=m.recipient_id,
            recipient_username=users.get(m.recipient_id, ""),
            body=m.body,
            is_read=bool(m.is_read),
            created_at=m.created_at,
        )
        for m in reversed(msgs)
    ]


@router.post("/dm/{user_id}", response_model=DMResponse, status_code=status.HTTP_201_CREATED)
async def send_dm(
    user_id: int,
    body: DMCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify target user exists
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")

    msg = DirectMessage(
        sender_id=current_user.id,
        recipient_id=user_id,
        body=body.body,
    )
    db.add(msg)
    create_notification(db, user_id, "direct_message", f"New message from {current_user.username}", body=body.body[:100], link=f"/groups?dm={current_user.id}")
    await db.commit()
    await db.refresh(msg)

    return DMResponse(
        id=msg.id,
        sender_id=msg.sender_id,
        sender_username=current_user.username,
        recipient_id=msg.recipient_id,
        recipient_username=target.username,
        body=msg.body,
        is_read=False,
        created_at=msg.created_at,
    )


@router.post("/dm/{user_id}/read")
async def mark_dm_read(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DirectMessage).where(
            DirectMessage.sender_id == user_id,
            DirectMessage.recipient_id == current_user.id,
            DirectMessage.is_read == 0,
        )
    )
    for msg in result.scalars().all():
        msg.is_read = 1
    await db.commit()
    return {"detail": "Messages marked as read"}


# ── Study Rooms ──────────────────────────────────────────────────────────────

@router.post("/groups/{group_id}/study-room", response_model=StudyRoomResponse, status_code=status.HTTP_201_CREATED)
async def create_study_room(
    group_id: int,
    body: StudyRoomCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    # Check if there's already an active room
    result = await db.execute(
        select(StudyRoom).where(StudyRoom.group_id == group_id, StudyRoom.is_active == 1)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An active study room already exists")

    room = StudyRoom(
        group_id=group_id,
        name=body.name,
        focus_minutes=body.focus_minutes,
        break_minutes=body.break_minutes,
        created_by=current_user.id,
    )
    db.add(room)
    await db.flush()

    participant = StudyRoomParticipant(room_id=room.id, user_id=current_user.id, status="focusing")
    db.add(participant)
    await db.commit()
    await db.refresh(room)

    return StudyRoomResponse(
        id=room.id,
        group_id=room.group_id,
        name=room.name,
        is_active=bool(room.is_active),
        focus_minutes=room.focus_minutes,
        break_minutes=room.break_minutes,
        created_by=room.created_by,
        participants=[
            StudyRoomParticipantResponse(
                user_id=current_user.id,
                username=current_user.username,
                status="focusing",
                is_online=True,
                joined_at=participant.joined_at,
            )
        ],
        created_at=room.created_at,
    )


@router.get("/groups/{group_id}/study-room", response_model=StudyRoomResponse | None)
async def get_study_room(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_member(db, group_id, current_user.id)

    result = await db.execute(
        select(StudyRoom).where(StudyRoom.group_id == group_id, StudyRoom.is_active == 1)
    )
    room = result.scalar_one_or_none()
    if not room:
        return None

    # Get participants
    p_result = await db.execute(
        select(StudyRoomParticipant, User.username)
        .join(User, StudyRoomParticipant.user_id == User.id)
        .where(StudyRoomParticipant.room_id == room.id)
    )

    now = datetime.now(timezone.utc)
    participants = []
    for p, username in p_result.all():
        last_ping = p.last_ping
        if last_ping and last_ping.tzinfo is None:
            last_ping = last_ping.replace(tzinfo=timezone.utc)
        is_online = (now - last_ping).total_seconds() < 60 if last_ping else False
        participants.append(StudyRoomParticipantResponse(
            user_id=p.user_id,
            username=username,
            status=p.status,
            is_online=is_online,
            joined_at=p.joined_at,
        ))

    return StudyRoomResponse(
        id=room.id,
        group_id=room.group_id,
        name=room.name,
        is_active=bool(room.is_active),
        focus_minutes=room.focus_minutes,
        break_minutes=room.break_minutes,
        created_by=room.created_by,
        participants=participants,
        created_at=room.created_at,
    )


@router.post("/study-room/{room_id}/join")
async def join_study_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(StudyRoom).where(StudyRoom.id == room_id, StudyRoom.is_active == 1))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    await _require_group_member(db, room.group_id, current_user.id)

    # Check if already participating
    result = await db.execute(
        select(StudyRoomParticipant).where(
            StudyRoomParticipant.room_id == room_id,
            StudyRoomParticipant.user_id == current_user.id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already in study room")

    participant = StudyRoomParticipant(room_id=room_id, user_id=current_user.id, status="focusing")
    db.add(participant)
    await db.commit()
    return {"detail": "Joined study room"}


@router.post("/study-room/{room_id}/ping")
async def ping_study_room(
    room_id: int,
    body: PingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StudyRoomParticipant).where(
            StudyRoomParticipant.room_id == room_id,
            StudyRoomParticipant.user_id == current_user.id,
        )
    )
    participant = result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Not in study room")

    participant.last_ping = datetime.now(timezone.utc)
    participant.status = body.status
    await db.commit()
    return {"detail": "Pinged"}


@router.delete("/study-room/{room_id}/leave")
async def leave_study_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StudyRoomParticipant).where(
            StudyRoomParticipant.room_id == room_id,
            StudyRoomParticipant.user_id == current_user.id,
        )
    )
    participant = result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Not in study room")

    await db.delete(participant)
    await db.commit()
    return {"detail": "Left study room"}


@router.delete("/study-room/{room_id}")
async def end_study_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(StudyRoom).where(StudyRoom.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")
    if room.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator can end the room")

    room.is_active = 0
    await db.commit()
    return {"detail": "Study room ended"}
