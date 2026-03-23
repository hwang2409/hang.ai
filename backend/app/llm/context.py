"""Learner context builder for contextual AI."""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cache_get, cache_set
from app.search.service import hybrid_search

logger = logging.getLogger(__name__)


async def get_learner_context(db: AsyncSession, user) -> str:
    """Return cached learner profile string. Empty if disabled or no data."""
    if not getattr(user, 'contextual_ai', True):
        return ""

    cached = await cache_get(f"learner_context:{user.id}")
    if cached:
        return cached

    profile = await _build_learner_context(db, user.id)
    if profile:
        await cache_set(f"learner_context:{user.id}", profile, ttl=3600)
    return profile


def inject_learner_context(system_prompt: str, learner_context: str) -> str:
    """Prepend learner profile to system prompt."""
    if not learner_context:
        return system_prompt
    return f"{learner_context}\n\n{system_prompt}"


async def _build_learner_context(db: AsyncSession, user_id: int) -> str:
    """Query DB and build a ~200-400 token learner profile string."""
    from app.flashcards.models import Flashcard
    from app.quizzes.models import Quiz, QuizAttempt
    from app.feynman.models import FeynmanSession, SocraticSession
    from app.notes.models import Document
    from app.studyplan.models import StudyPlan, StudyPlanItem
    from app.pomodoro.models import StudySession
    from datetime import date, timedelta

    lines = []
    has_data = False

    # 1. Flashcard stats
    try:
        now = datetime.now(timezone.utc)

        total_r = await db.execute(
            select(sa_func.count(Flashcard.id)).where(Flashcard.user_id == user_id)
        )
        total = total_r.scalar() or 0

        due_r = await db.execute(
            select(sa_func.count(Flashcard.id)).where(
                Flashcard.user_id == user_id,
                Flashcard.next_review <= now,
            )
        )
        due_today = due_r.scalar() or 0

        mastered_r = await db.execute(
            select(sa_func.count(Flashcard.id)).where(
                Flashcard.user_id == user_id,
                Flashcard.interval >= 21,
            )
        )
        mastered = mastered_r.scalar() or 0

        weak_r = await db.execute(
            select(sa_func.count(Flashcard.id)).where(
                Flashcard.user_id == user_id,
                Flashcard.ease_factor < 1.8,
            )
        )
        weak = weak_r.scalar() or 0

        if total > 0:
            has_data = True
            lines.append(f"Flashcards: {total} total, {due_today} due today, {mastered} mastered, {weak} weak")
    except Exception:
        logger.debug("Failed to query flashcard stats", exc_info=True)

    # 2. Quiz stats
    try:
        attempts_r = await db.execute(
            select(sa_func.count(QuizAttempt.id)).where(QuizAttempt.user_id == user_id)
        )
        total_attempts = attempts_r.scalar() or 0

        if total_attempts > 0:
            has_data = True
            scores_r = await db.execute(
                select(QuizAttempt.score, QuizAttempt.total_questions)
                .where(QuizAttempt.user_id == user_id)
            )
            attempts = scores_r.all()
            percentages = [
                (a.score / a.total_questions * 100) if a.total_questions > 0 else 0
                for a in attempts
            ]
            avg_pct = round(sum(percentages) / len(percentages))
            lines.append(f"Quizzes: {total_attempts} taken, avg {avg_pct}%")
    except Exception:
        logger.debug("Failed to query quiz stats", exc_info=True)

    # 3. Study streak
    try:
        today = date.today()
        result = await db.execute(
            select(sa_func.distinct(sa_func.date(StudySession.started_at)))
            .where(
                StudySession.user_id == user_id,
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

        if streak > 0:
            has_data = True
            lines.append(f"Study streak: {streak} day{'s' if streak != 1 else ''}")
    except Exception:
        logger.debug("Failed to query study streak", exc_info=True)

    # 4. Topic mastery — top 3 strong, bottom 3 weak
    try:
        topics_map = {}

        # Flashcards grouped by note
        fc_result = await db.execute(
            select(
                Flashcard.note_id,
                sa_func.avg(Flashcard.ease_factor).label("avg_ease"),
            )
            .where(Flashcard.user_id == user_id, Flashcard.note_id.isnot(None))
            .group_by(Flashcard.note_id)
        )
        for row in fc_result.all():
            topics_map.setdefault(row.note_id, {})
            topics_map[row.note_id]["flashcard_ease"] = float(row.avg_ease)

        # Quiz scores grouped by note
        quiz_result = await db.execute(
            select(
                Quiz.note_id,
                sa_func.avg(QuizAttempt.score * 100.0 / QuizAttempt.total_questions).label("avg_pct"),
            )
            .join(QuizAttempt, Quiz.id == QuizAttempt.quiz_id)
            .where(
                Quiz.user_id == user_id,
                QuizAttempt.total_questions > 0,
                Quiz.note_id.isnot(None),
            )
            .group_by(Quiz.note_id)
        )
        for row in quiz_result.all():
            topics_map.setdefault(row.note_id, {})
            topics_map[row.note_id]["quiz_avg_pct"] = float(row.avg_pct)

        # Feynman best scores by note
        feynman_result = await db.execute(
            select(
                FeynmanSession.note_id,
                sa_func.max(FeynmanSession.score).label("best_score"),
            )
            .where(
                FeynmanSession.user_id == user_id,
                FeynmanSession.note_id.isnot(None),
            )
            .group_by(FeynmanSession.note_id)
        )
        for row in feynman_result.all():
            topics_map.setdefault(row.note_id, {})
            topics_map[row.note_id]["feynman_score"] = row.best_score

        if topics_map:
            # Fetch note titles
            note_ids = list(topics_map.keys())
            notes_result = await db.execute(
                select(Document.id, Document.title).where(Document.id.in_(note_ids))
            )
            note_titles = {row[0]: row[1] or "Untitled" for row in notes_result.all()}

            # Compute mastery per topic
            scored_topics = []
            for note_id, data in topics_map.items():
                scores = []
                fc_ease = data.get("flashcard_ease")
                if fc_ease is not None:
                    fc_pct = max(0, min(100, (fc_ease - 1.3) / (2.5 - 1.3) * 100))
                    scores.append(fc_pct)
                quiz_pct = data.get("quiz_avg_pct")
                if quiz_pct is not None:
                    scores.append(quiz_pct)
                feynman = data.get("feynman_score")
                if feynman is not None:
                    scores.append(float(feynman))

                if scores:
                    mastery = round(sum(scores) / len(scores))
                    title = note_titles.get(note_id, "Untitled")
                    scored_topics.append((title, mastery))

            if scored_topics:
                has_data = True
                scored_topics.sort(key=lambda x: x[1], reverse=True)
                strong = scored_topics[:3]
                weak = [t for t in scored_topics if t[1] < 60][-3:]

                if strong:
                    strong_str = ", ".join(f"{t[0]} ({t[1]}%)" for t in strong)
                    lines.append(f"Strong topics: {strong_str}")
                if weak:
                    weak.sort(key=lambda x: x[1])
                    weak_str = ", ".join(f"{t[0]} ({t[1]}%)" for t in weak)
                    lines.append(f"Weak topics: {weak_str}")
    except Exception:
        logger.debug("Failed to query topic mastery", exc_info=True)

    # 5. Recent weaknesses from Feynman/Socratic evaluations
    try:
        weaknesses = []

        # Last 3 completed Feynman sessions with weaknesses
        feynman_sessions = await db.execute(
            select(FeynmanSession.weaknesses)
            .where(
                FeynmanSession.user_id == user_id,
                FeynmanSession.weaknesses.isnot(None),
            )
            .order_by(FeynmanSession.created_at.desc())
            .limit(3)
        )
        for row in feynman_sessions.all():
            try:
                ws = json.loads(row[0]) if row[0] else []
                weaknesses.extend(ws[:2])
            except (json.JSONDecodeError, TypeError):
                pass

        # Last 3 completed Socratic sessions with weaknesses
        socratic_sessions = await db.execute(
            select(SocraticSession.weaknesses)
            .where(
                SocraticSession.user_id == user_id,
                SocraticSession.status == "completed",
                SocraticSession.weaknesses.isnot(None),
            )
            .order_by(SocraticSession.created_at.desc())
            .limit(3)
        )
        for row in socratic_sessions.all():
            try:
                ws = json.loads(row[0]) if row[0] else []
                weaknesses.extend(ws[:2])
            except (json.JSONDecodeError, TypeError):
                pass

        if weaknesses:
            has_data = True
            # Dedupe and limit
            seen = set()
            unique = []
            for w in weaknesses:
                if w and w not in seen:
                    seen.add(w)
                    unique.append(w)
                if len(unique) >= 4:
                    break
            if unique:
                lines.append("\nRecent weaknesses (from evaluations):")
                for w in unique:
                    lines.append(f"- {w}")
    except Exception:
        logger.debug("Failed to query recent weaknesses", exc_info=True)

    # 6. Active study plan
    try:
        plan_r = await db.execute(
            select(StudyPlan)
            .where(StudyPlan.user_id == user_id, StudyPlan.status == "active")
            .order_by(StudyPlan.created_at.desc())
            .limit(1)
        )
        plan = plan_r.scalar_one_or_none()
        if plan:
            # Count completion
            total_items_r = await db.execute(
                select(sa_func.count(StudyPlanItem.id)).where(StudyPlanItem.plan_id == plan.id)
            )
            total_items = total_items_r.scalar() or 0

            completed_items_r = await db.execute(
                select(sa_func.count(StudyPlanItem.id)).where(
                    StudyPlanItem.plan_id == plan.id,
                    StudyPlanItem.completed == True,
                )
            )
            completed_items = completed_items_r.scalar() or 0

            if total_items > 0:
                has_data = True
                pct = round(completed_items / total_items * 100)
                plan_line = f'Active study plan: "{plan.title}"'
                if plan.exam_date:
                    plan_line += f" — exam {plan.exam_date.isoformat()}"
                plan_line += f", {pct}% complete"
                lines.append(f"\n{plan_line}")
    except Exception:
        logger.debug("Failed to query study plan", exc_info=True)

    if not has_data:
        return ""

    profile = "[LEARNER PROFILE]\n"
    profile += "\n".join(lines)
    profile += "\n\nAdapt your responses to the student's level. Focus on weak areas. Reference mastered topics as scaffolds when explaining new concepts."
    profile += "\n[/LEARNER PROFILE]"
    return profile


async def retrieve_relevant_notes(db: AsyncSession, user_id: int, query: str, limit: int = 5) -> list[dict]:
    """RAG retrieval: search user's notes by semantic + keyword similarity."""
    try:
        results = await hybrid_search(db, user_id, query, limit=limit)
    except Exception:
        logger.debug("RAG retrieval failed", exc_info=True)
        return []

    items = []
    for score, doc, match_type in results:
        snippet = (doc.content or "")[:500] if doc.type != "canvas" else ""
        items.append({
            "id": doc.id,
            "title": doc.title or "Untitled",
            "snippet": snippet,
            "score": round(score, 4),
        })

    return items


def format_notes_context(notes: list[dict]) -> str:
    """Format retrieved notes into a system prompt section."""
    if not notes:
        return ""
    sections = []
    for n in notes:
        sections.append(f"[Note: {n['title']}] (id:{n['id']})\n{n['snippet']}")
    return "[YOUR NOTES]\nRelevant notes from the user's library:\n\n" + "\n\n".join(sections) + "\n[/YOUR NOTES]"
