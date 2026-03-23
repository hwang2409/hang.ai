from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.pomodoro.models import StudySession
from app.pomodoro.schemas import CreateSessionRequest, SessionResponse, StatsResponse, AnalyticsResponse, WeeklyHours
from app.automations.engine import fire_event

router = APIRouter()


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    body: CreateSessionRequest,
    background_tasks: BackgroundTasks,
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

    from app.social.activity import log_activity
    background_tasks.add_task(
        log_activity, current_user.id, "study_session",
        {"duration_minutes": body.duration_minutes, "session_type": body.session_type, "label": body.label},
    )

    if body.completed:
        background_tasks.add_task(fire_event, current_user.id, "pomodoro_completed", {
            "duration_minutes": body.duration_minutes, "note_id": body.note_id, "label": body.label or "",
        })

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
    max_streak_check = 365
    while max_streak_check > 0:
        max_streak_check -= 1
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


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics(
    weeks: int = Query(12, ge=4, le=52),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # Start of current week (Monday)
    current_week_start = today - timedelta(days=today.weekday())
    earliest = current_week_start - timedelta(weeks=weeks - 1)

    # Fetch all focus sessions in the range
    result = await db.execute(
        select(StudySession).where(
            StudySession.user_id == current_user.id,
            StudySession.session_type == "focus",
            StudySession.completed == True,  # noqa: E712
            StudySession.started_at >= earliest,
        )
    )
    sessions = result.scalars().all()

    # Bucket by week
    week_data: dict[str, dict] = {}
    for i in range(weeks):
        ws = current_week_start - timedelta(weeks=weeks - 1 - i)
        key = ws.strftime("%Y-%m-%d")
        week_data[key] = {"minutes": 0, "sessions": 0}

    for s in sessions:
        started = s.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        week_start = started - timedelta(days=started.weekday())
        key = week_start.strftime("%Y-%m-%d")
        if key in week_data:
            week_data[key]["minutes"] += s.duration_minutes
            week_data[key]["sessions"] += 1

    weekly_hours = [
        WeeklyHours(
            week=key,
            hours=round(data["minutes"] / 60, 1),
            sessions=data["sessions"],
        )
        for key, data in week_data.items()
    ]

    hours_values = [w.hours for w in weekly_hours]
    total_hours = round(sum(hours_values), 1)
    non_zero = [h for h in hours_values if h > 0]
    avg_hours = round(sum(non_zero) / len(non_zero), 1) if non_zero else 0.0
    best_week = max(hours_values) if hours_values else 0.0

    # Trend: compare last 4 weeks avg to previous 4 weeks avg
    if len(hours_values) >= 8:
        recent_avg = sum(hours_values[-4:]) / 4
        previous_avg = sum(hours_values[-8:-4]) / 4
        if previous_avg == 0:
            trend = "increasing" if recent_avg > 0 else "stable"
        else:
            change = (recent_avg - previous_avg) / previous_avg
            if change > 0.1:
                trend = "increasing"
            elif change < -0.1:
                trend = "decreasing"
            else:
                trend = "stable"
    else:
        trend = "stable"

    return AnalyticsResponse(
        weekly_hours=weekly_hours,
        avg_hours_per_week=avg_hours,
        total_hours=total_hours,
        best_week_hours=best_week,
        trend=trend,
    )
