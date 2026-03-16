from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.pomodoro.models import StudySession
from app.pomodoro.schemas import CreateSessionRequest, SessionResponse, StatsResponse

router = APIRouter()


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    body: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = StudySession(
        user_id=current_user.id,
        label=body.label,
        session_type=body.session_type,
        duration_minutes=body.duration_minutes,
        planned_minutes=body.planned_minutes,
        completed=body.completed,
        note_id=body.note_id,
        started_at=body.started_at or datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    days: int = Query(7, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(StudySession)
        .where(
            StudySession.user_id == current_user.id,
            StudySession.started_at >= since,
        )
        .order_by(StudySession.started_at.desc())
    )
    return result.scalars().all()


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    base = select(StudySession).where(
        StudySession.user_id == current_user.id,
        StudySession.session_type == "focus",
        StudySession.completed == True,
    )

    # Today
    result = await db.execute(
        select(
            func.count(StudySession.id),
            func.coalesce(func.sum(StudySession.duration_minutes), 0),
        ).where(
            StudySession.user_id == current_user.id,
            StudySession.session_type == "focus",
            StudySession.completed == True,
            StudySession.started_at >= today_start,
        )
    )
    today_sessions, today_minutes = result.one()

    # This week
    result = await db.execute(
        select(
            func.count(StudySession.id),
            func.coalesce(func.sum(StudySession.duration_minutes), 0),
        ).where(
            StudySession.user_id == current_user.id,
            StudySession.session_type == "focus",
            StudySession.completed == True,
            StudySession.started_at >= week_start,
        )
    )
    week_sessions, week_minutes = result.one()

    # Total
    result = await db.execute(
        select(
            func.count(StudySession.id),
            func.coalesce(func.sum(StudySession.duration_minutes), 0),
        ).where(
            StudySession.user_id == current_user.id,
            StudySession.session_type == "focus",
            StudySession.completed == True,
        )
    )
    total_sessions, total_minutes = result.one()

    # Streak: count consecutive days with at least one focus session
    streak = 0
    check_date = today_start
    while True:
        day_end = check_date + timedelta(days=1)
        result = await db.execute(
            select(func.count(StudySession.id)).where(
                StudySession.user_id == current_user.id,
                StudySession.session_type == "focus",
                StudySession.completed == True,
                StudySession.started_at >= check_date,
                StudySession.started_at < day_end,
            )
        )
        count = result.scalar()
        if count and count > 0:
            streak += 1
            check_date -= timedelta(days=1)
        else:
            # If checking today and no sessions yet, check if yesterday continues streak
            if check_date == today_start and streak == 0:
                check_date -= timedelta(days=1)
                continue
            break

    return StatsResponse(
        today_sessions=today_sessions,
        today_focus_minutes=today_minutes,
        week_sessions=week_sessions,
        week_focus_minutes=week_minutes,
        current_streak=streak,
        total_sessions=total_sessions,
        total_focus_minutes=total_minutes,
    )
