"""
Automation engine: event dispatch → rule matching → action execution.

Usage from any endpoint:
    background_tasks.add_task(fire_event, user_id, "quiz_completed", {"score": 3, "total": 5, ...})
"""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.automations.models import AutomationRule, AutomationLog

logger = logging.getLogger(__name__)

# ── Trigger & Action registries ───────────────────────────────────────────────

TRIGGERS = {
    "note_updated": {
        "label": "Note updated",
        "description": "When a note's content is saved",
        "fields": ["note_id", "title"],
    },
    "import_completed": {
        "label": "Import completed",
        "description": "When notes are imported from a file or URL",
        "fields": ["note_ids", "folder_name", "count"],
    },
    "quiz_completed": {
        "label": "Quiz completed",
        "description": "When a quiz attempt is submitted",
        "fields": ["quiz_id", "title", "score", "total", "pct", "note_id"],
        "conditions": ["score_below", "score_above"],
    },
    "feynman_completed": {
        "label": "Feynman session completed",
        "description": "When a Feynman explanation is scored",
        "fields": ["score", "topic", "note_id"],
        "conditions": ["score_below", "score_above"],
    },
    "flashcard_reviewed": {
        "label": "Flashcard reviewed",
        "description": "When a flashcard is reviewed",
        "fields": ["card_id", "quality", "note_id"],
        "conditions": ["quality_below", "quality_above"],
    },
    "pomodoro_completed": {
        "label": "Pomodoro completed",
        "description": "When a focus session finishes",
        "fields": ["duration_minutes", "note_id", "label"],
    },
}

ACTIONS = {
    "generate_flashcards": {
        "label": "Generate flashcards",
        "description": "AI-generate flashcards from the related note",
        "config_fields": {"count": {"type": "int", "default": 10, "label": "Number of cards"}},
    },
    "generate_quiz": {
        "label": "Generate quiz",
        "description": "AI-generate a quiz from the related note",
        "config_fields": {"count": {"type": "int", "default": 5, "label": "Number of questions"}},
    },
    "create_todo": {
        "label": "Create todo",
        "description": "Create a todo item",
        "config_fields": {"text_template": {"type": "str", "default": "Review: {topic}", "label": "Todo text"}},
    },
    "create_notification": {
        "label": "Send notification",
        "description": "Send an in-app notification",
        "config_fields": {
            "title_template": {"type": "str", "default": "Automation triggered", "label": "Title"},
            "body_template": {"type": "str", "default": "", "label": "Body"},
        },
    },
    "analyze_note": {
        "label": "Analyze note",
        "description": "Run AI analysis (concepts, definitions, prerequisites)",
        "config_fields": {},
    },
}


# ── Template rendering ────────────────────────────────────────────────────────

def _render(template: str, data: dict) -> str:
    result = template
    for key, value in data.items():
        result = result.replace(f"{{{key}}}", str(value))
    return result


# ── Condition evaluation ──────────────────────────────────────────────────────

def _check_conditions(trigger_config: dict, event_data: dict) -> bool:
    score_below = trigger_config.get("score_below")
    if score_below is not None:
        val = event_data.get("score") or event_data.get("pct") or event_data.get("quality")
        if val is not None and float(val) >= float(score_below):
            return False

    score_above = trigger_config.get("score_above")
    if score_above is not None:
        val = event_data.get("score") or event_data.get("pct") or event_data.get("quality")
        if val is not None and float(val) <= float(score_above):
            return False

    quality_below = trigger_config.get("quality_below")
    if quality_below is not None:
        if event_data.get("quality") is not None and int(event_data["quality"]) >= int(quality_below):
            return False

    quality_above = trigger_config.get("quality_above")
    if quality_above is not None:
        if event_data.get("quality") is not None and int(event_data["quality"]) <= int(quality_above):
            return False

    return True


# ── Action executors ──────────────────────────────────────────────────────────

async def _get_api_key(db: AsyncSession, user_id: int) -> str | None:
    from app.auth.models import User
    from app.crypto import decrypt_api_key
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user and user.encrypted_anthropic_key:
        try:
            return decrypt_api_key(user.encrypted_anthropic_key)
        except Exception:
            pass
    return None


def _resolve_note_id(event_data: dict) -> int | None:
    """Extract note_id from event data, checking multiple fields."""
    nid = event_data.get("note_id")
    if nid:
        return int(nid)
    # For import events, use the first note
    note_ids = event_data.get("note_ids")
    if note_ids and isinstance(note_ids, list) and note_ids:
        return int(note_ids[0])
    return None


async def _exec_generate_flashcards(db: AsyncSession, user_id: int, config: dict, event_data: dict) -> dict:
    note_id = _resolve_note_id(event_data)
    if not note_id:
        return {"skipped": "no note_id in event data"}

    from app.notes.models import Document
    result = await db.execute(select(Document).where(Document.id == note_id, Document.user_id == user_id))
    doc = result.scalar_one_or_none()
    if not doc or not doc.content:
        return {"skipped": "note not found or empty"}

    api_key = await _get_api_key(db, user_id)
    count = config.get("count", 10)

    from app.llm.service import evaluate_text
    from app.llm.response_parser import parse_llm_json
    from app.flashcards.models import Flashcard

    prompt = (
        f"Generate exactly {count} flashcards from the following study material. "
        "Return ONLY a JSON array of objects with \"front\" and \"back\" keys.\n\n"
        f"Title: {doc.title or 'Untitled'}\n\nContent:\n{doc.content[:5000]}"
    )
    raw = await evaluate_text(prompt, api_key=api_key)
    cards_data = parse_llm_json(raw)
    if not isinstance(cards_data, list):
        return {"skipped": "LLM did not return array"}

    created = 0
    for item in cards_data:
        if isinstance(item, dict) and "front" in item and "back" in item:
            db.add(Flashcard(user_id=user_id, note_id=note_id, front=item["front"], back=item["back"]))
            created += 1
    await db.flush()
    return {"generated": created}


async def _exec_generate_quiz(db: AsyncSession, user_id: int, config: dict, event_data: dict) -> dict:
    note_id = _resolve_note_id(event_data)
    if not note_id:
        return {"skipped": "no note_id in event data"}

    from app.notes.models import Document
    result = await db.execute(select(Document).where(Document.id == note_id, Document.user_id == user_id))
    doc = result.scalar_one_or_none()
    if not doc or not doc.content:
        return {"skipped": "note not found or empty"}

    api_key = await _get_api_key(db, user_id)
    count = config.get("count", 5)

    from app.llm.service import evaluate_text
    from app.llm.response_parser import parse_llm_json
    from app.quizzes.models import Quiz, QuizQuestion

    prompt = f"""Generate {count} quiz questions from this study material.

Title: {doc.title or 'Untitled'}
Content:
{doc.content[:5000]}

Return ONLY a JSON object: {{"title": "Quiz: <topic>", "questions": [{{"question": "...", "type": "multiple_choice", "options": ["A","B","C","D"], "correct_answer": "A", "explanation": "..."}}]}}"""

    raw = await evaluate_text(prompt, api_key=api_key)
    data = parse_llm_json(raw)
    quiz = Quiz(title=data.get("title", f"Quiz: {doc.title}"), user_id=user_id, note_id=note_id)
    db.add(quiz)
    await db.flush()

    questions = data.get("questions", [])
    for q in questions[:count]:
        db.add(QuizQuestion(
            quiz_id=quiz.id,
            question=q.get("question", ""),
            question_type=q.get("type", "multiple_choice"),
            options=json.dumps(q.get("options", [])),
            correct_answer=q.get("correct_answer", ""),
            explanation=q.get("explanation", ""),
        ))
    await db.flush()
    return {"quiz_id": quiz.id, "questions": len(questions)}


async def _exec_create_todo(db: AsyncSession, user_id: int, config: dict, event_data: dict) -> dict:
    from app.todos.models import TodoItem
    text = _render(config.get("text_template", "Automation: review"), event_data)
    todo = TodoItem(user_id=user_id, text=text, priority=config.get("priority", 0))
    db.add(todo)
    await db.flush()
    return {"todo_id": todo.id, "text": text}


async def _exec_create_notification(db: AsyncSession, user_id: int, config: dict, event_data: dict) -> dict:
    from app.notifications.helpers import create_notification
    title = _render(config.get("title_template", "Automation triggered"), event_data)
    body = _render(config.get("body_template", ""), event_data)
    link = _render(config.get("link_template", ""), event_data)
    notif = await create_notification(db, user_id, type="automation", title=title, body=body, link=link)
    return {"notification_id": notif.id}


async def _exec_analyze_note(db: AsyncSession, user_id: int, config: dict, event_data: dict) -> dict:
    note_id = _resolve_note_id(event_data)
    if not note_id:
        return {"skipped": "no note_id in event data"}

    from app.notes.models import Document
    result = await db.execute(select(Document).where(Document.id == note_id, Document.user_id == user_id))
    doc = result.scalar_one_or_none()
    if not doc or not doc.content:
        return {"skipped": "note not found or empty"}

    api_key = await _get_api_key(db, user_id)
    from app.notes.insights import analyze_document_background
    await analyze_document_background(doc.id, doc.content, doc.title or "", api_key)
    return {"analyzed": note_id}


_ACTION_MAP = {
    "generate_flashcards": _exec_generate_flashcards,
    "generate_quiz": _exec_generate_quiz,
    "create_todo": _exec_create_todo,
    "create_notification": _exec_create_notification,
    "analyze_note": _exec_analyze_note,
}


# ── Main event dispatcher ────────────────────────────────────────────────────

async def fire_event(user_id: int, event_type: str, event_data: dict):
    """Background task: match automation rules and execute actions."""
    from app.database import async_session

    async with async_session() as db:
        result = await db.execute(
            select(AutomationRule).where(
                AutomationRule.user_id == user_id,
                AutomationRule.trigger_type == event_type,
                AutomationRule.enabled == True,
            )
        )
        rules = result.scalars().all()
        if not rules:
            return

        for rule in rules:
            try:
                trigger_config = json.loads(rule.trigger_config) if rule.trigger_config else {}
                if not _check_conditions(trigger_config, event_data):
                    db.add(AutomationLog(
                        rule_id=rule.id, user_id=user_id,
                        trigger_data=json.dumps(event_data),
                        action_result=json.dumps({"skipped": "conditions not met"}),
                        status="skipped",
                    ))
                    continue

                action_config = json.loads(rule.action_config) if rule.action_config else {}
                executor = _ACTION_MAP.get(rule.action_type)
                if not executor:
                    continue

                action_result = await executor(db, user_id, action_config, event_data)

                db.add(AutomationLog(
                    rule_id=rule.id, user_id=user_id,
                    trigger_data=json.dumps(event_data),
                    action_result=json.dumps(action_result),
                    status="success",
                ))
                rule.last_triggered_at = datetime.now(timezone.utc)
                rule.trigger_count = (rule.trigger_count or 0) + 1

            except Exception as e:
                logger.warning("Automation rule %d failed: %s", rule.id, e, exc_info=True)
                db.add(AutomationLog(
                    rule_id=rule.id, user_id=user_id,
                    trigger_data=json.dumps(event_data),
                    action_result=json.dumps({"error": str(e)}),
                    status="failed",
                ))

        await db.commit()
