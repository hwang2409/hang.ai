from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func as sa_func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.flashcards.models import Flashcard, FlashcardReview
from app.feynman.models import FeynmanSession
from app.todos.models import TodoItem
from app.notes.models import Document
from app.pomodoro.models import StudySession
from app.quizzes.models import Quiz, QuizAttempt
from app.dashboard.schemas import (
    BriefItem,
    DashboardReview,
    DueFlashcard,
    QuizBriefInfo,
    TrendsResponse,
    WeakTopic,
    WeeklyFlashcardRetention,
    WeeklyQuizAccuracy,
    WeeklyStudyMinutes,
    OverdueTodo,
    StaleNote,
    StudyPlanToday,
)

router = APIRouter()


@router.get("/trends", response_model=TrendsResponse)
async def get_trends(
    weeks: int = Query(default=8, ge=1, le=52),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return weekly performance trends for quiz accuracy, flashcard retention, and study time."""
    today = date.today()
    # Align to Monday of current week
    monday = today - timedelta(days=today.weekday())
    start_date = monday - timedelta(weeks=weeks - 1)

    # 1. Quiz accuracy by week
    quiz_accuracy: list[WeeklyQuizAccuracy] = []
    quiz_result = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.completed_at >= datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc),
            QuizAttempt.total_questions > 0,
        ).order_by(QuizAttempt.completed_at)
    )
    attempts = quiz_result.scalars().all()
    # Group by week
    quiz_by_week: dict[str, list] = {}
    for a in attempts:
        completed = a.completed_at
        if completed.tzinfo is None:
            completed = completed.replace(tzinfo=timezone.utc)
        week_start = (completed.date() - timedelta(days=completed.weekday())).isoformat()
        quiz_by_week.setdefault(week_start, []).append(
            round(a.score * 100 / a.total_questions)
        )
    for w in range(weeks):
        wk = (start_date + timedelta(weeks=w)).isoformat()
        if wk in quiz_by_week:
            scores = quiz_by_week[wk]
            quiz_accuracy.append(WeeklyQuizAccuracy(
                week=wk, avg_pct=round(sum(scores) / len(scores), 1), count=len(scores)
            ))
        else:
            quiz_accuracy.append(WeeklyQuizAccuracy(week=wk, avg_pct=0, count=0))

    # 2. Flashcard retention by week (from FlashcardReview history)
    flashcard_retention: list[WeeklyFlashcardRetention] = []
    review_result = await db.execute(
        select(FlashcardReview).where(
            FlashcardReview.user_id == current_user.id,
            FlashcardReview.reviewed_at >= datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc),
        ).order_by(FlashcardReview.reviewed_at)
    )
    reviews = review_result.scalars().all()
    reviews_by_week: dict[str, list[int]] = {}
    for r in reviews:
        reviewed = r.reviewed_at
        if reviewed.tzinfo is None:
            reviewed = reviewed.replace(tzinfo=timezone.utc)
        week_start = (reviewed.date() - timedelta(days=reviewed.weekday())).isoformat()
        reviews_by_week.setdefault(week_start, []).append(r.quality)
    for w in range(weeks):
        wk = (start_date + timedelta(weeks=w)).isoformat()
        if wk in reviews_by_week:
            quals = reviews_by_week[wk]
            retained = sum(1 for q in quals if q >= 3)
            flashcard_retention.append(WeeklyFlashcardRetention(
                week=wk, retention_pct=round(retained * 100 / len(quals), 1), total=len(quals)
            ))
        else:
            flashcard_retention.append(WeeklyFlashcardRetention(week=wk, retention_pct=0, total=0))

    # 3. Study minutes by week (from pomodoro sessions)
    study_minutes: list[WeeklyStudyMinutes] = []
    session_result = await db.execute(
        select(StudySession).where(
            StudySession.user_id == current_user.id,
            StudySession.session_type == "focus",
            StudySession.completed == True,  # noqa: E712
            StudySession.started_at >= datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc),
        ).order_by(StudySession.started_at)
    )
    sessions = session_result.scalars().all()
    sessions_by_week: dict[str, int] = {}
    for s in sessions:
        started = s.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        week_start = (started.date() - timedelta(days=started.weekday())).isoformat()
        sessions_by_week[week_start] = sessions_by_week.get(week_start, 0) + s.duration_minutes
    for w in range(weeks):
        wk = (start_date + timedelta(weeks=w)).isoformat()
        study_minutes.append(WeeklyStudyMinutes(week=wk, minutes=sessions_by_week.get(wk, 0)))

    return TrendsResponse(
        quiz_accuracy=quiz_accuracy,
        flashcard_retention=flashcard_retention,
        study_minutes=study_minutes,
    )


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

    # 8. Quiz retakes — most recent attempt per quiz, scored < 70%
    quiz_retakes: list[QuizBriefInfo] = []
    try:
        latest_sub = (
            select(
                QuizAttempt.quiz_id,
                sa_func.max(QuizAttempt.completed_at).label("max_completed"),
            )
            .where(QuizAttempt.user_id == current_user.id)
            .group_by(QuizAttempt.quiz_id)
            .subquery()
        )
        retake_q = (
            select(QuizAttempt, Quiz.title)
            .join(
                latest_sub,
                and_(
                    QuizAttempt.quiz_id == latest_sub.c.quiz_id,
                    QuizAttempt.completed_at == latest_sub.c.max_completed,
                ),
            )
            .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
            .where(
                Quiz.user_id == current_user.id,
                QuizAttempt.total_questions > 0,
            )
        )
        retake_result = await db.execute(retake_q)
        for attempt, quiz_title in retake_result.all():
            pct = round(attempt.score * 100 / attempt.total_questions)
            if pct < 70:
                # Count total attempts for this quiz
                count_res = await db.execute(
                    select(sa_func.count(QuizAttempt.id)).where(
                        QuizAttempt.quiz_id == attempt.quiz_id,
                        QuizAttempt.user_id == current_user.id,
                    )
                )
                quiz_retakes.append(
                    QuizBriefInfo(
                        quiz_id=attempt.quiz_id,
                        quiz_title=quiz_title,
                        last_score_pct=pct,
                        attempt_count=count_res.scalar() or 1,
                    )
                )
    except Exception:
        pass

    # 9. Build brief_items
    brief_items: list[BriefItem] = []

    # Overdue todos → priority 1
    for t in overdue_todos:
        brief_items.append(
            BriefItem(
                type="overdue_todo",
                priority=1,
                title=t.text,
                subtitle=f"due {t.due_date}" if t.due_date else "overdue",
                link="/todos",
                meta={"id": t.id},
            )
        )

    # Flashcards due → single item, priority 1 if any 2+ days overdue else 2
    if due_flashcard_count > 0:
        two_days_ago = now - timedelta(days=2)
        overdue_fc_result = await db.execute(
            select(sa_func.count(Flashcard.id)).where(
                Flashcard.user_id == current_user.id,
                Flashcard.next_review <= two_days_ago,
            )
        )
        overdue_fc_count = overdue_fc_result.scalar() or 0
        fc_priority = 1 if overdue_fc_count > 0 else 2
        subtitle = ""
        if overdue_fc_count > 0:
            subtitle = f"{overdue_fc_count} {'is' if overdue_fc_count == 1 else 'are'} 2+ days overdue"
        brief_items.append(
            BriefItem(
                type="flashcard_review",
                priority=fc_priority,
                title=f"Review {due_flashcard_count} flashcard{'s' if due_flashcard_count != 1 else ''}",
                subtitle=subtitle,
                link="/flashcards/study",
                meta={"count": due_flashcard_count, "overdue_count": overdue_fc_count},
            )
        )

    # Study plan items (incomplete) → priority 2
    for item in study_plan_today:
        if not item.get("completed", False):
            brief_items.append(
                BriefItem(
                    type="study_plan",
                    priority=2,
                    title=item["topic"],
                    subtitle=item.get("plan_title", ""),
                    link="/studyplan",
                    meta={"id": item["id"]},
                )
            )

    # Quiz retakes → priority 2
    for qr in quiz_retakes:
        brief_items.append(
            BriefItem(
                type="quiz_retake",
                priority=2,
                title=f"Retake: {qr.quiz_title}",
                subtitle=f"Last score {qr.last_score_pct}%",
                link=f"/quizzes/{qr.quiz_id}",
                meta={"quiz_id": qr.quiz_id, "score": qr.last_score_pct},
            )
        )

    # Weak Feynman topics → priority 2
    for wt in weak_topics:
        brief_items.append(
            BriefItem(
                type="feynman_retry",
                priority=2,
                title=f"Re-explain: {wt.topic}",
                subtitle=f"Score {wt.score}%",
                link="/feynman",
                meta={"id": wt.id, "score": wt.score},
            )
        )

    # Upcoming todos → priority 3
    for t in upcoming_todos:
        brief_items.append(
            BriefItem(
                type="upcoming_todo",
                priority=3,
                title=t.text,
                subtitle=f"due {t.due_date}" if t.due_date else "",
                link="/todos",
                meta={"id": t.id},
            )
        )

    # Stale notes → priority 3
    for n in stale_notes:
        brief_items.append(
            BriefItem(
                type="stale_note",
                priority=3,
                title=f"Review: {n.title}",
                subtitle="not updated in 14+ days",
                link=f"/notes/{n.id}",
                meta={"id": n.id},
            )
        )

    # Sort by (priority, type_order)
    type_order = {
        "overdue_todo": 0,
        "flashcard_review": 1,
        "study_plan": 2,
        "quiz_retake": 3,
        "feynman_retry": 4,
        "upcoming_todo": 5,
        "stale_note": 6,
    }
    brief_items.sort(key=lambda x: (x.priority, type_order.get(x.type, 99)))

    # 10. Study next — top priority action
    study_next = brief_items[0] if brief_items else None

    # 11. Estimated study time
    est_minutes = 0
    est_minutes += min(due_flashcard_count, 60) * 2  # ~2 min per card, cap 60
    incomplete_plan = [i for i in study_plan_today if not i.get("completed", False)]
    est_minutes += len(incomplete_plan) * 20  # ~20 min per plan item
    est_minutes += len(quiz_retakes) * 10  # ~10 min per quiz retake
    est_minutes += len(weak_topics) * 10  # ~10 min per Feynman retry
    est_minutes += len(overdue_todos) * 5  # ~5 min per overdue todo

    # 12. Greeting — narrative summary
    hour = datetime.now().hour
    if hour < 12:
        time_greeting = "good morning"
    elif hour < 17:
        time_greeting = "good afternoon"
    else:
        time_greeting = "good evening"

    parts: list[str] = []
    if due_flashcard_count > 0:
        parts.append(f"{due_flashcard_count} flashcard{'s' if due_flashcard_count != 1 else ''} due")
    if len(overdue_todos) > 0:
        parts.append(f"{len(overdue_todos)} overdue task{'s' if len(overdue_todos) != 1 else ''}")
    if incomplete_plan:
        parts.append(f"{len(incomplete_plan)} study plan item{'s' if len(incomplete_plan) != 1 else ''}")
    if quiz_retakes:
        parts.append(f"{len(quiz_retakes)} quiz{'zes' if len(quiz_retakes) != 1 else ''} to retake")
    if weak_topics:
        parts.append(f"{len(weak_topics)} weak topic{'s' if len(weak_topics) != 1 else ''} to review")

    if not parts:
        greeting = f"{time_greeting} — you're all caught up. nice work."
    elif len(parts) == 1:
        greeting = f"{time_greeting} — you have {parts[0]}."
    else:
        greeting = f"{time_greeting} — you have {', '.join(parts[:-1])} and {parts[-1]}."

    if streak >= 3:
        greeting += f" {streak}-day streak — keep it going."

    return DashboardReview(
        due_flashcards=due_flashcards,
        due_flashcard_count=due_flashcard_count,
        weak_topics=weak_topics,
        overdue_todos=overdue_todos,
        upcoming_todos=upcoming_todos,
        stale_notes=stale_notes,
        study_plan_today=study_plan_today,
        current_streak=streak,
        quiz_retakes=quiz_retakes,
        brief_items=brief_items,
        greeting=greeting,
        study_next=study_next,
        estimated_minutes=est_minutes,
    )
