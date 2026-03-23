from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.deps import get_db, get_current_user
from app.auth.models import User
from app.pomodoro.models import StudySession

router = APIRouter()


@router.get("/insights")
async def get_insights(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cutoff = datetime.utcnow() - timedelta(days=days)

    # Get all focus sessions in range
    result = await db.execute(
        select(StudySession).where(
            StudySession.user_id == current_user.id,
            StudySession.session_type == "focus",
            StudySession.started_at >= cutoff,
        )
    )
    sessions = result.scalars().all()

    if not sessions:
        return {
            "total_sessions": 0,
            "total_minutes": 0,
            "completion_rate": 0,
            "avg_session_minutes": 0,
            "peak_hour": None,
            "peak_day": None,
            "top_subjects": [],
            "hourly_distribution": [0] * 24,
            "daily_distribution": [0] * 7,
        }

    total = len(sessions)
    completed = sum(1 for s in sessions if s.completed)
    total_minutes = sum(s.duration_minutes for s in sessions)

    # Hourly distribution
    hourly = [0] * 24
    for s in sessions:
        hourly[s.started_at.hour] += 1

    # Daily distribution (0=Monday, 6=Sunday)
    daily = [0] * 7
    for s in sessions:
        daily[s.started_at.weekday()] += 1

    # Top subjects from labels
    subject_counts = {}
    for s in sessions:
        label = s.label or "unlabeled"
        subject_counts[label] = subject_counts.get(label, 0) + 1
    top_subjects = sorted(subject_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    peak_hour = max(range(24), key=lambda h: hourly[h])
    day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    peak_day = day_names[max(range(7), key=lambda d: daily[d])]

    return {
        "total_sessions": total,
        "total_minutes": total_minutes,
        "completion_rate": round(completed / total * 100, 1) if total else 0,
        "avg_session_minutes": round(total_minutes / total, 1) if total else 0,
        "peak_hour": peak_hour,
        "peak_day": peak_day,
        "top_subjects": [{"label": l, "count": c} for l, c in top_subjects],
        "hourly_distribution": hourly,
        "daily_distribution": daily,
    }
