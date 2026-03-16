from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, func as sa_func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.flashcards.models import Flashcard
from app.feynman.models import FeynmanSession
from app.todos.models import TodoItem
from app.notes.models import Document
from app.pomodoro.models import StudySession
from app.dashboard.schemas import (
    DashboardReview,
    DueFlashcard,
    WeakTopic,
    OverdueTodo,
    StaleNote,
    StudyPlanToday,
)

router = APIRouter()


@router.get("/review", response_model=DashboardReview)
async def get_review(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    today = date.today()

    # 1. Due flashcards (next 10) + total count
    due_q = (
        select(Flashcard)
        .where(
            Flashcard.user_id == current_user.id,
            Flashcard.next_review <= now,
        )
        .order_by(Flashcard.next_review)
        .limit(10)
    )
    result = await db.execute(due_q)
    due_flashcards = result.scalars().all()

    count_result = await db.execute(
        select(sa_func.count(Flashcard.id)).where(
            Flashcard.user_id == current_user.id,
            Flashcard.next_review <= now,
        )
    )
    due_flashcard_count = count_result.scalar() or 0

    # 2. Weak topics (Feynman sessions with score < 60)
    weak_q = (
        select(FeynmanSession)
        .where(
            FeynmanSession.user_id == current_user.id,
            FeynmanSession.score < 60,
        )
        .order_by(FeynmanSession.score.asc())
        .limit(5)
    )
    result = await db.execute(weak_q)
    weak_topics = result.scalars().all()

    # 3. Overdue todos
    overdue_q = (
        select(TodoItem)
        .where(
            TodoItem.user_id == current_user.id,
            TodoItem.completed == False,
            TodoItem.due_date < today,
        )
        .order_by(TodoItem.due_date)
    )
    result = await db.execute(overdue_q)
    overdue_todos = result.scalars().all()

    # 4. Upcoming todos (next 3 days)
    upcoming_q = (
        select(TodoItem)
        .where(
            TodoItem.user_id == current_user.id,
            TodoItem.completed == False,
            TodoItem.due_date >= today,
            TodoItem.due_date <= today + timedelta(days=3),
        )
        .order_by(TodoItem.due_date)
    )
    result = await db.execute(upcoming_q)
    upcoming_todos = result.scalars().all()

    # 5. Stale notes (not updated in 14+ days)
    stale_cutoff = now - timedelta(days=14)
    stale_q = (
        select(Document)
        .where(
            Document.user_id == current_user.id,
            Document.deleted == False,
            Document.updated_at < stale_cutoff,
        )
        .order_by(Document.updated_at.asc())
        .limit(5)
    )
    result = await db.execute(stale_q)
    stale_notes = result.scalars().all()

    # 6. Study plan items for today
    study_plan_today: list[dict] = []
    try:
        from app.studyplan.models import StudyPlanItem, StudyPlan

        plan_q = (
            select(StudyPlanItem, StudyPlan.title)
            .join(StudyPlan, StudyPlanItem.plan_id == StudyPlan.id)
            .where(
                StudyPlan.user_id == current_user.id,
                StudyPlan.status == "active",
                StudyPlanItem.date == today,
            )
        )
        result = await db.execute(plan_q)
        rows = result.all()
        for item, plan_title in rows:
            study_plan_today.append(
                {
                    "id": item.id,
                    "topic": item.topic,
                    "description": item.description,
                    "completed": item.completed,
                    "plan_title": plan_title or "",
                }
            )
    except Exception:
        pass

    # 7. Streak calculation
    result = await db.execute(
        select(sa_func.date(StudySession.started_at))
        .distinct()
        .where(
            StudySession.user_id == current_user.id,
            StudySession.session_type == "focus",
            StudySession.completed == True,
        )
        .order_by(sa_func.date(StudySession.started_at).desc())
    )
    dates = [row[0] for row in result.all()]

    streak = 0
    check_date = today
    for d in dates:
        if isinstance(d, str):
            d = date.fromisoformat(d)
        if d == check_date:
            streak += 1
            check_date -= timedelta(days=1)
        elif d < check_date:
            break

    return DashboardReview(
        due_flashcards=due_flashcards,
        due_flashcard_count=due_flashcard_count,
        weak_topics=weak_topics,
        overdue_todos=overdue_todos,
        upcoming_todos=upcoming_todos,
        stale_notes=stale_notes,
        study_plan_today=study_plan_today,
        current_streak=streak,
    )
