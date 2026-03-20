import json
import logging

import httpx

from app.integrations.models import UserIntegration

logger = logging.getLogger(__name__)


async def fire_webhook(integration: UserIntegration, event: str, data: dict) -> None:
    """Fire a webhook notification. Fire-and-forget — logs errors but never raises."""
    try:
        config = json.loads(integration.config or "{}")
    except (json.JSONDecodeError, TypeError):
        config = {}

    url = config.get("url")
    if not url:
        return

    events = config.get("events", {})
    if not events.get(event, False):
        return

    # Build human-readable summary for Slack/Discord compatibility
    text = _build_summary(event, data)

    payload = {
        "text": text,
        "event": event,
        "data": data,
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(url, json=payload)
    except Exception as e:
        logger.warning("Webhook delivery failed for integration %s: %s", integration.id, e)


async def fire_test_webhook(url: str) -> tuple[bool, int | None, str | None]:
    """Send a test webhook to verify URL works. Returns (success, status_code, error)."""
    payload = {
        "text": "Test notification from Neuronic — your webhook is working!",
        "event": "test",
        "data": {"test": True},
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=payload)
            return resp.status_code < 400, resp.status_code, None
    except Exception as e:
        return False, None, str(e)


def _build_summary(event: str, data: dict) -> str:
    if event == "daily_brief":
        parts = []
        if data.get("flashcards_due"):
            parts.append(f"{data['flashcards_due']} flashcards due")
        if data.get("todos_overdue"):
            parts.append(f"{data['todos_overdue']} overdue tasks")
        if data.get("study_plan_items"):
            parts.append(f"{data['study_plan_items']} study plan items")
        return f"Daily brief: {', '.join(parts)}" if parts else "Daily brief: you're all caught up!"

    if event == "flashcard_due":
        count = data.get("count", 0)
        return f"You have {count} flashcard{'s' if count != 1 else ''} due for review"

    if event == "quiz_complete":
        score = data.get("score", 0)
        total = data.get("total", 0)
        title = data.get("title", "Quiz")
        pct = round(score * 100 / total) if total > 0 else 0
        return f"Quiz completed: {title} — {score}/{total} ({pct}%)"

    if event == "study_streak":
        streak = data.get("streak", 0)
        return f"Study streak milestone: {streak} days! Keep it going!"

    return f"Neuronic notification: {event}"


async def fire_webhooks_for_user(user_id: int, event: str, data: dict, db) -> None:
    """Find all enabled webhooks for a user and fire the given event."""
    from sqlalchemy import select

    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == user_id,
            UserIntegration.type == "webhook",
            UserIntegration.enabled == True,
        )
    )
    integrations = result.scalars().all()
    for integration in integrations:
        await fire_webhook(integration, event, data)
