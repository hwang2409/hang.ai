"""Unified Timeline — chronological view of all study activity."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document
from app.flashcards.models import Flashcard, FlashcardReview
from app.quizzes.models import Quiz, QuizAttempt
from app.feynman.models import FeynmanSession
from app.pomodoro.models import StudySession
from app.files.models import UploadedFile
from app.todos.models import TodoItem
from app.studyplan.models import StudyPlanItem, StudyPlan

router = APIRouter()

ALL_TYPES = {"note", "flashcard_review", "quiz", "feynman", "pomodoro", "file", "todo", "study_plan"}


def _ts(dt) -> str:
    """ISO timestamp string from a datetime or date."""
    if dt is None:
        return ""
    if isinstance(dt, datetime):
        return dt.isoformat()
    return datetime.combine(dt, datetime.min.time()).isoformat()


@router.get("")
async def get_timeline(
    days: int = Query(30, ge=1, le=365),
    types: str = Query("", description="Comma-separated type filter"),
    search: str = Query("", description="Text search"),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    type_filter = set(t.strip() for t in types.split(",") if t.strip()) if types else ALL_TYPES
    q = search.lower().strip()
    events: list[dict] = []

    uid = current_user.id

    # ── Notes created/updated ─────────────────────────────────────────────
    if "note" in type_filter:
        result = await db.execute(
            select(Document).where(
                Document.user_id == uid,
                Document.deleted == False,
                Document.created_at >= cutoff,
            ).order_by(desc(Document.created_at)).limit(limit)
        )
        for doc in result.scalars().all():
            title = doc.title or "Untitled"
            if q and q not in title.lower():
                continue
            events.append({
                "type": "note",
                "timestamp": _ts(doc.created_at),
                "title": f"Created note: {title}",
                "subtitle": doc.type or "text",
                "link": f"/notes/{doc.id}",
                "meta": {"note_id": doc.id},
            })

    # ── Flashcard reviews ─────────────────────────────────────────────────
    if "flashcard_review" in type_filter:
        result = await db.execute(
            select(FlashcardReview, Flashcard.front, Flashcard.note_id)
            .join(Flashcard, FlashcardReview.card_id == Flashcard.id)
            .where(
                FlashcardReview.user_id == uid,
                FlashcardReview.reviewed_at >= cutoff,
            ).order_by(desc(FlashcardReview.reviewed_at)).limit(limit)
        )
        for review, front, note_id in result.all():
            preview = (front or "")[:60]
            if q and q not in preview.lower():
                continue
            quality_label = ["Again", "Hard", "Hard", "Good", "Good", "Easy"][min(review.quality, 5)]
            events.append({
                "type": "flashcard_review",
                "timestamp": _ts(review.reviewed_at),
                "title": f"Reviewed: {preview}",
                "subtitle": f"Rated {quality_label} ({review.quality}/5)",
                "link": "/flashcards",
                "meta": {"card_id": review.card_id, "quality": review.quality, "note_id": note_id},
            })

    # ── Quiz attempts ─────────────────────────────────────────────────────
    if "quiz" in type_filter:
        result = await db.execute(
            select(QuizAttempt, Quiz.title, Quiz.note_id)
            .join(Quiz, QuizAttempt.quiz_id == Quiz.id)
            .where(
                QuizAttempt.user_id == uid,
                QuizAttempt.completed_at >= cutoff,
            ).order_by(desc(QuizAttempt.completed_at)).limit(limit)
        )
        for attempt, title, note_id in result.all():
            if q and q not in (title or "").lower():
                continue
            pct = round(attempt.score / attempt.total_questions * 100) if attempt.total_questions else 0
            events.append({
                "type": "quiz",
                "timestamp": _ts(attempt.completed_at),
                "title": f"Quiz: {title or 'Untitled'}",
                "subtitle": f"{attempt.score}/{attempt.total_questions} ({pct}%)",
                "link": f"/quizzes",
                "meta": {"quiz_id": attempt.quiz_id, "score": attempt.score, "total": attempt.total_questions, "pct": pct, "note_id": note_id},
            })

    # ── Feynman sessions ──────────────────────────────────────────────────
    if "feynman" in type_filter:
        result = await db.execute(
            select(FeynmanSession).where(
                FeynmanSession.user_id == uid,
                FeynmanSession.created_at >= cutoff,
            ).order_by(desc(FeynmanSession.created_at)).limit(limit)
        )
        for session in result.scalars().all():
            if q and q not in (session.topic or "").lower():
                continue
            events.append({
                "type": "feynman",
                "timestamp": _ts(session.created_at),
                "title": f"Feynman: {session.topic}",
                "subtitle": f"Score: {session.score}%",
                "link": "/feynman",
                "meta": {"score": session.score, "note_id": session.note_id},
            })

    # ── Pomodoro sessions ─────────────────────────────────────────────────
    if "pomodoro" in type_filter:
        result = await db.execute(
            select(StudySession).where(
                StudySession.user_id == uid,
                StudySession.started_at >= cutoff,
                StudySession.session_type == "focus",
            ).order_by(desc(StudySession.started_at)).limit(limit)
        )
        for session in result.scalars().all():
            label = session.label or "Focus session"
            if q and q not in label.lower():
                continue
            events.append({
                "type": "pomodoro",
                "timestamp": _ts(session.started_at),
                "title": label,
                "subtitle": f"{session.duration_minutes}min" + (" (completed)" if session.completed else ""),
                "link": "/pomodoro",
                "meta": {"duration": session.duration_minutes, "completed": session.completed, "note_id": session.note_id},
            })

    # ── File uploads ──────────────────────────────────────────────────────
    if "file" in type_filter:
        result = await db.execute(
            select(UploadedFile).where(
                UploadedFile.user_id == uid,
                UploadedFile.deleted == False,
                UploadedFile.created_at >= cutoff,
            ).order_by(desc(UploadedFile.created_at)).limit(limit)
        )
        for f in result.scalars().all():
            name = f.original_name or f.filename
            if q and q not in name.lower():
                continue
            events.append({
                "type": "file",
                "timestamp": _ts(f.created_at),
                "title": f"Uploaded: {name}",
                "subtitle": f.file_type or "",
                "link": f"/files/{f.id}",
                "meta": {"file_id": f.id, "file_type": f.file_type},
            })

    # ── Todos ─────────────────────────────────────────────────────────────
    if "todo" in type_filter:
        result = await db.execute(
            select(TodoItem).where(
                TodoItem.user_id == uid,
                TodoItem.created_at >= cutoff,
            ).order_by(desc(TodoItem.created_at)).limit(limit)
        )
        for todo in result.scalars().all():
            if q and q not in (todo.text or "").lower():
                continue
            events.append({
                "type": "todo",
                "timestamp": _ts(todo.created_at),
                "title": f"Todo: {todo.text}",
                "subtitle": "completed" if todo.completed else ("due " + str(todo.due_date) if todo.due_date else "open"),
                "link": "/todos",
                "meta": {"todo_id": todo.id, "completed": todo.completed},
            })

    # ── Study plan items ──────────────────────────────────────────────────
    if "study_plan" in type_filter:
        result = await db.execute(
            select(StudyPlanItem, StudyPlan.title.label("plan_title"))
            .join(StudyPlan, StudyPlanItem.plan_id == StudyPlan.id)
            .where(
                StudyPlan.user_id == uid,
                StudyPlanItem.created_at >= cutoff,
            ).order_by(desc(StudyPlanItem.created_at)).limit(limit)
        )
        for item, plan_title in result.all():
            if q and q not in (item.topic or "").lower() and q not in (plan_title or "").lower():
                continue
            events.append({
                "type": "study_plan",
                "timestamp": _ts(item.created_at),
                "title": f"Study plan: {item.topic}",
                "subtitle": f"{plan_title}" + (" (done)" if item.completed else ""),
                "link": "/studyplan",
                "meta": {"completed": item.completed},
            })

    # Sort all events by timestamp descending and limit
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    events = events[:limit]

    return {"events": events, "count": len(events)}
