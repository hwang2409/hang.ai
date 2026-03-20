from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func as sa_func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.cache import cache_get, cache_set
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
    HabitInsight,
    HabitsResponse,
    QuizBriefInfo,
    TopicMastery,
    TopicMasteryResponse,
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
    cache_key = f"dashboard:trends:{current_user.id}:{weeks}"
    cached = await cache_get(cache_key)
    if cached:
        return TrendsResponse(**cached)

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

    response = TrendsResponse(
        quiz_accuracy=quiz_accuracy,
        flashcard_retention=flashcard_retention,
        study_minutes=study_minutes,
    )
    await cache_set(cache_key, response.model_dump(), ttl=300)
    return response


@router.get("/review", response_model=DashboardReview)
async def get_review(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cache_key = f"dashboard:review:{current_user.id}"
    cached = await cache_get(cache_key)
    if cached:
        return DashboardReview(**cached)

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

        # Pre-fetch attempt counts grouped by quiz_id (avoids N+1 queries)
        count_sub = await db.execute(
            select(
                QuizAttempt.quiz_id,
                sa_func.count(QuizAttempt.id).label("cnt"),
            )
            .where(QuizAttempt.user_id == current_user.id)
            .group_by(QuizAttempt.quiz_id)
        )
        attempt_counts = {row.quiz_id: row.cnt for row in count_sub.all()}

        for attempt, quiz_title in retake_result.all():
            pct = round(attempt.score * 100 / attempt.total_questions)
            if pct < 70:
                quiz_retakes.append(
                    QuizBriefInfo(
                        quiz_id=attempt.quiz_id,
                        quiz_title=quiz_title,
                        last_score_pct=pct,
                        attempt_count=attempt_counts.get(attempt.quiz_id, 1),
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

    response = DashboardReview(
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
    await cache_set(cache_key, response.model_dump(), ttl=60)
    return response


@router.get("/mastery", response_model=TopicMasteryResponse)
async def get_topic_mastery(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregate topic mastery from flashcards, quizzes, and Feynman sessions."""
    topics_map: dict[int | None, dict] = {}

    # 1. Flashcards grouped by note
    fc_result = await db.execute(
        select(
            Flashcard.note_id,
            sa_func.avg(Flashcard.ease_factor).label("avg_ease"),
            sa_func.count(Flashcard.id).label("card_count"),
        )
        .where(Flashcard.user_id == current_user.id)
        .group_by(Flashcard.note_id)
    )
    for row in fc_result.all():
        note_id = row.note_id
        if note_id is None:
            continue
        topics_map.setdefault(note_id, {})
        topics_map[note_id]["flashcard_ease"] = round(float(row.avg_ease), 2)
        topics_map[note_id]["flashcard_count"] = row.card_count

    # 2. Quiz scores grouped by note (via Quiz.note_id)
    quiz_result = await db.execute(
        select(
            Quiz.note_id,
            sa_func.avg(QuizAttempt.score * 100.0 / QuizAttempt.total_questions).label("avg_pct"),
            sa_func.count(QuizAttempt.id).label("attempt_count"),
        )
        .join(QuizAttempt, Quiz.id == QuizAttempt.quiz_id)
        .where(
            Quiz.user_id == current_user.id,
            QuizAttempt.total_questions > 0,
        )
        .group_by(Quiz.note_id)
    )
    for row in quiz_result.all():
        note_id = row.note_id
        if note_id is None:
            continue
        topics_map.setdefault(note_id, {})
        topics_map[note_id]["quiz_avg_pct"] = round(float(row.avg_pct), 1)
        topics_map[note_id]["quiz_attempts"] = row.attempt_count

    # 3. Feynman sessions by note
    feynman_result = await db.execute(
        select(
            FeynmanSession.note_id,
            sa_func.max(FeynmanSession.score).label("best_score"),
        )
        .where(
            FeynmanSession.user_id == current_user.id,
            FeynmanSession.note_id.isnot(None),
        )
        .group_by(FeynmanSession.note_id)
    )
    for row in feynman_result.all():
        note_id = row.note_id
        topics_map.setdefault(note_id, {})
        topics_map[note_id]["feynman_score"] = row.best_score

    if not topics_map:
        return TopicMasteryResponse(topics=[])

    # Fetch note titles
    note_ids = list(topics_map.keys())
    notes_result = await db.execute(
        select(Document.id, Document.title).where(Document.id.in_(note_ids))
    )
    note_titles: dict[int, str] = {}
    for row in notes_result.all():
        note_titles[row[0]] = row[1] or "Untitled"

    # Compute mastery score per topic
    topics: list[TopicMastery] = []
    for note_id, data in topics_map.items():
        scores = []
        fc_ease = data.get("flashcard_ease")
        if fc_ease is not None:
            # Ease 1.3 = 0%, 2.5 = 100% (normal range)
            fc_pct = max(0, min(100, (fc_ease - 1.3) / (2.5 - 1.3) * 100))
            scores.append(fc_pct)
        quiz_pct = data.get("quiz_avg_pct")
        if quiz_pct is not None:
            scores.append(quiz_pct)
        feynman = data.get("feynman_score")
        if feynman is not None:
            scores.append(float(feynman))

        mastery = round(sum(scores) / len(scores), 1) if scores else 0

        topics.append(TopicMastery(
            topic=note_titles.get(note_id, "Untitled"),
            note_id=note_id,
            mastery_pct=mastery,
            flashcard_ease=fc_ease,
            flashcard_count=data.get("flashcard_count", 0),
            quiz_avg_pct=quiz_pct,
            quiz_attempts=data.get("quiz_attempts", 0),
            feynman_score=feynman,
        ))

    topics.sort(key=lambda t: t.mastery_pct, reverse=True)
    return TopicMasteryResponse(topics=topics[:15])


@router.get("/habits", response_model=HabitsResponse)
async def get_habits(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Analyze the last 30 days of study data and return actionable habit insights."""
    cache_key = f"dashboard:habits:{current_user.id}"
    cached = await cache_get(cache_key)
    if cached:
        return HabitsResponse(**cached)

    today = date.today()
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    insights: list[HabitInsight] = []

    # ── Fetch pomodoro focus sessions (last 30 days) ────────────────────
    session_result = await db.execute(
        select(StudySession).where(
            StudySession.user_id == current_user.id,
            StudySession.session_type == "focus",
            StudySession.started_at >= thirty_days_ago,
        ).order_by(StudySession.started_at)
    )
    sessions = session_result.scalars().all()

    # Normalize timestamps
    for s in sessions:
        if s.started_at and s.started_at.tzinfo is None:
            s.started_at = s.started_at.replace(tzinfo=timezone.utc)
        if s.completed_at and s.completed_at.tzinfo is None:
            s.completed_at = s.completed_at.replace(tzinfo=timezone.utc)

    completed_sessions = [s for s in sessions if s.completed]

    # ── Fetch flashcard reviews (last 30 days) ──────────────────────────
    review_result = await db.execute(
        select(FlashcardReview).where(
            FlashcardReview.user_id == current_user.id,
            FlashcardReview.reviewed_at >= thirty_days_ago,
        ).order_by(FlashcardReview.reviewed_at)
    )
    reviews = review_result.scalars().all()
    for r in reviews:
        if r.reviewed_at and r.reviewed_at.tzinfo is None:
            r.reviewed_at = r.reviewed_at.replace(tzinfo=timezone.utc)

    # ── Fetch quiz attempts (last 30 days) ──────────────────────────────
    quiz_result = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.completed_at >= thirty_days_ago,
            QuizAttempt.total_questions > 0,
        ).order_by(QuizAttempt.completed_at)
    )
    attempts = quiz_result.scalars().all()
    for a in attempts:
        if a.completed_at and a.completed_at.tzinfo is None:
            a.completed_at = a.completed_at.replace(tzinfo=timezone.utc)

    # ── Compute summary stats ───────────────────────────────────────────
    # Study days and daily minutes
    study_dates: set[date] = set()
    total_focus_minutes = 0
    for s in completed_sessions:
        study_dates.add(s.started_at.date())
        total_focus_minutes += s.duration_minutes

    study_days_last_30 = len(study_dates)
    avg_daily_minutes = round(total_focus_minutes / 30, 1)

    # ── Insight 1: Best study time ──────────────────────────────────────
    if len(completed_sessions) >= 5:
        # Group by hour of day
        hour_durations: dict[int, list[int]] = {}
        for s in completed_sessions:
            hour = s.started_at.hour
            hour_durations.setdefault(hour, []).append(s.duration_minutes)

        # Find hour with best average duration
        hour_avgs: dict[int, float] = {}
        for h, durations in hour_durations.items():
            hour_avgs[h] = sum(durations) / len(durations)

        overall_avg = total_focus_minutes / len(completed_sessions)
        best_hour = max(hour_avgs, key=hour_avgs.get)  # type: ignore[arg-type]
        best_avg = hour_avgs[best_hour]

        # Determine time-of-day label
        def _hour_label(h: int) -> str:
            if h < 6:
                return "early morning"
            elif h < 12:
                return "the morning"
            elif h < 17:
                return "the afternoon"
            elif h < 21:
                return "the evening"
            else:
                return "late night"

        # Build a range around the best hour using adjacent hours with above-average durations
        range_start = best_hour
        range_end = best_hour
        for offset in range(1, 4):
            prev_h = best_hour - offset
            if prev_h in hour_avgs and hour_avgs[prev_h] >= overall_avg:
                range_start = prev_h
            else:
                break
        for offset in range(1, 4):
            next_h = best_hour + offset
            if next_h in hour_avgs and hour_avgs[next_h] >= overall_avg:
                range_end = next_h
            else:
                break

        def _fmt_hour(h: int) -> str:
            if h == 0:
                return "12am"
            elif h < 12:
                return f"{h}am"
            elif h == 12:
                return "12pm"
            else:
                return f"{h - 12}pm"

        time_label = _hour_label(best_hour)
        insights.append(HabitInsight(
            category="timing",
            title=f"You study best in {time_label}",
            detail=(
                f"Your focus sessions between {_fmt_hour(range_start)}-{_fmt_hour(range_end + 1)} "
                f"average {round(best_avg)} min vs {round(overall_avg)} min overall."
            ),
        ))

    # ── Insight 2: Most productive day of week ──────────────────────────
    if completed_sessions:
        day_minutes: dict[int, int] = {}
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        for s in completed_sessions:
            dow = s.started_at.weekday()
            day_minutes[dow] = day_minutes.get(dow, 0) + s.duration_minutes

        distinct_days = len(day_minutes)
        if distinct_days >= 2:
            best_day = max(day_minutes, key=day_minutes.get)  # type: ignore[arg-type]
            best_minutes = day_minutes[best_day]
            total_all = sum(day_minutes.values())
            pct_of_total = round(best_minutes * 100 / total_all)
            insights.append(HabitInsight(
                category="timing",
                title=f"{day_names[best_day]} is your power day",
                detail=(
                    f"You logged {best_minutes} focus minutes on {day_names[best_day]}s — "
                    f"{pct_of_total}% of your total study time this month."
                ),
            ))

    # ── Insight 3: Consistency trend (last 7 vs previous 7) ─────────────
    this_week_dates: set[date] = set()
    prev_week_dates: set[date] = set()
    for s in completed_sessions:
        d = s.started_at.date()
        if d >= (today - timedelta(days=6)):
            this_week_dates.add(d)
        elif d >= (today - timedelta(days=13)):
            prev_week_dates.add(d)

    this_week_count = len(this_week_dates)
    prev_week_count = len(prev_week_dates)

    if this_week_count + prev_week_count > 0:
        if this_week_count > prev_week_count:
            insights.append(HabitInsight(
                category="consistency",
                title="Your consistency is improving",
                detail=(
                    f"You studied {this_week_count} day{'s' if this_week_count != 1 else ''} "
                    f"this week vs {prev_week_count} last week — nice improvement!"
                ),
            ))
        elif this_week_count < prev_week_count:
            insights.append(HabitInsight(
                category="consistency",
                title="Study consistency dipped",
                detail=(
                    f"You studied {this_week_count} day{'s' if this_week_count != 1 else ''} "
                    f"this week vs {prev_week_count} last week. "
                    f"Try to squeeze in a short session today."
                ),
            ))
        else:
            insights.append(HabitInsight(
                category="consistency",
                title="Steady consistency",
                detail=(
                    f"You studied {this_week_count} day{'s' if this_week_count != 1 else ''} "
                    f"both this week and last — keep it up!"
                ),
            ))

    # ── Insight 4: Session length sweet spot ────────────────────────────
    if len(sessions) >= 3:
        total_sessions = len(sessions)
        completed_count = len(completed_sessions)
        completion_rate = round(completed_count * 100 / total_sessions)

        if completed_count > 0:
            avg_duration = round(total_focus_minutes / completed_count)

            # Check if we have enough correlated data (flashcard reviews within 2h of sessions)
            correlated_data: dict[str, list[int]] = {"short": [], "medium": [], "long": []}
            for s in completed_sessions:
                session_end = s.started_at + timedelta(minutes=s.duration_minutes)
                window_end = session_end + timedelta(hours=2)
                for r in reviews:
                    if session_end <= r.reviewed_at <= window_end:
                        if s.duration_minutes <= 15:
                            correlated_data["short"].append(r.quality)
                        elif s.duration_minutes <= 35:
                            correlated_data["medium"].append(r.quality)
                        else:
                            correlated_data["long"].append(r.quality)

            has_correlation = sum(
                1 for bucket in correlated_data.values() if len(bucket) >= 3
            ) >= 2

            if has_correlation:
                bucket_avgs = {}
                bucket_labels = {"short": "short (<=15 min)", "medium": "medium (16-35 min)", "long": "long (36+ min)"}
                for bucket, quals in correlated_data.items():
                    if quals:
                        bucket_avgs[bucket] = round(sum(quals) / len(quals), 1)
                best_bucket = max(bucket_avgs, key=bucket_avgs.get)  # type: ignore[arg-type]
                insights.append(HabitInsight(
                    category="sessions",
                    title=f"{bucket_labels[best_bucket].capitalize()} sessions work best for you",
                    detail=(
                        f"Your flashcard review quality after {bucket_labels[best_bucket]} sessions "
                        f"averages {bucket_avgs[best_bucket]}/5 — higher than other session lengths."
                    ),
                ))
            else:
                insights.append(HabitInsight(
                    category="sessions",
                    title=f"Your average session is {avg_duration} minutes",
                    detail=(
                        f"You completed {completed_count} of {total_sessions} sessions "
                        f"({completion_rate}% completion rate) with an average of {avg_duration} min each."
                    ),
                ))

    # ── Insight 5: Retention pattern ────────────────────────────────────
    if len(reviews) >= 5:
        good_count = sum(1 for r in reviews if r.quality >= 3)
        weak_count = len(reviews) - good_count
        retention_pct = round(good_count * 100 / len(reviews))

        if retention_pct >= 70:
            insights.append(HabitInsight(
                category="performance",
                title="Strong retention on flashcards",
                detail=(
                    f"{retention_pct}% of your {len(reviews)} reviews scored 3+ (good/easy). "
                    f"Your spaced repetition is paying off."
                ),
            ))
        else:
            insights.append(HabitInsight(
                category="performance",
                title="Flashcard retention needs attention",
                detail=(
                    f"Only {retention_pct}% of your {len(reviews)} reviews scored 3+. "
                    f"{weak_count} reviews were rated hard or forgotten — "
                    f"consider reviewing more frequently or breaking cards into simpler ones."
                ),
            ))

    # ── Insight 6: Quiz improvement ─────────────────────────────────────
    if len(attempts) >= 2:
        midpoint = thirty_days_ago + timedelta(days=15)
        first_half = [a for a in attempts if a.completed_at < midpoint]
        second_half = [a for a in attempts if a.completed_at >= midpoint]

        if first_half and second_half:
            first_avg = sum(
                a.score * 100 / a.total_questions for a in first_half
            ) / len(first_half)
            second_avg = sum(
                a.score * 100 / a.total_questions for a in second_half
            ) / len(second_half)

            diff = round(second_avg - first_avg, 1)
            if diff > 0:
                insights.append(HabitInsight(
                    category="performance",
                    title="Quiz scores are trending up",
                    detail=(
                        f"Your average quiz score improved from {round(first_avg)}% to "
                        f"{round(second_avg)}% between the first and second halves of the month."
                    ),
                ))
            elif diff < -5:
                insights.append(HabitInsight(
                    category="performance",
                    title="Quiz scores dipped recently",
                    detail=(
                        f"Your average dropped from {round(first_avg)}% to {round(second_avg)}%. "
                        f"This could mean you're tackling harder material — "
                        f"or it might be time to revisit fundamentals."
                    ),
                ))
            else:
                insights.append(HabitInsight(
                    category="performance",
                    title="Quiz scores are holding steady",
                    detail=(
                        f"You averaged {round(first_avg)}% in the first half and "
                        f"{round(second_avg)}% in the second half — consistent performance."
                    ),
                ))

    # ── Sort insights by impact (performance > consistency > timing > sessions)
    category_priority = {"performance": 0, "consistency": 1, "timing": 2, "sessions": 3}
    insights.sort(key=lambda i: category_priority.get(i.category, 99))

    # Cap at 5 insights
    insights = insights[:5]

    response = HabitsResponse(
        insights=insights,
        study_days_last_30=study_days_last_30,
        avg_daily_minutes=avg_daily_minutes,
    )
    await cache_set(cache_key, response.model_dump(), ttl=600)
    return response
