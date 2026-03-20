"""Google Calendar API integration — OAuth token management and event sync."""

import asyncio
import json
import logging
from datetime import date, datetime, timedelta, timezone
from functools import partial

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.integrations.models import UserIntegration

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar"]
CALENDAR_SUMMARY = "Neuronic Study Schedule"
CALENDAR_COLOR = "9"  # bold blue


# ── Credential Management ────────────────────────────────────────────────

def _build_credentials(config: dict) -> Credentials:
    return Credentials(
        token=config.get("access_token"),
        refresh_token=config.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )


async def _ensure_fresh_credentials(
    integration: UserIntegration, db: AsyncSession
) -> Credentials:
    config = json.loads(integration.config or "{}")
    creds = _build_credentials(config)

    # Check if token needs refresh
    expiry_str = config.get("token_expiry")
    needs_refresh = True
    if expiry_str:
        try:
            expiry = datetime.fromisoformat(expiry_str)
            needs_refresh = datetime.now(timezone.utc) >= expiry - timedelta(minutes=5)
        except (ValueError, TypeError):
            pass

    if needs_refresh and creds.refresh_token:
        try:
            from google.auth.transport.requests import Request
            await asyncio.to_thread(creds.refresh, Request())
            config["access_token"] = creds.token
            if creds.expiry:
                config["token_expiry"] = creds.expiry.isoformat()
            config.pop("error", None)
            integration.config = json.dumps(config)
            await db.commit()
        except Exception as e:
            logger.warning("Google token refresh failed for integration %s: %s", integration.id, e)
            config["error"] = "token_revoked"
            integration.config = json.dumps(config)
            integration.enabled = False
            await db.commit()
            raise

    return creds


def _get_service(creds: Credentials):
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


# ── Calendar CRUD ─────────────────────────────────────────────────────────

def _create_hang_calendar_sync(creds: Credentials) -> str:
    service = _get_service(creds)
    body = {"summary": CALENDAR_SUMMARY, "timeZone": "UTC"}
    created = service.calendars().insert(body=body).execute()
    cal_id = created["id"]
    # Set color on the calendar list entry
    try:
        service.calendarList().patch(
            calendarId=cal_id, body={"colorId": CALENDAR_COLOR}
        ).execute()
    except Exception:
        pass
    return cal_id


def _delete_hang_calendar_sync(creds: Credentials, calendar_id: str) -> None:
    service = _get_service(creds)
    try:
        service.calendars().delete(calendarId=calendar_id).execute()
    except HttpError as e:
        if e.resp.status != 404:
            raise


# ── Event CRUD ────────────────────────────────────────────────────────────

def _upsert_event_sync(
    creds: Credentials, calendar_id: str, event_id: str, event_body: dict
) -> None:
    service = _get_service(creds)
    try:
        service.events().update(
            calendarId=calendar_id, eventId=event_id, body=event_body
        ).execute()
    except HttpError as e:
        if e.resp.status == 404:
            event_body["id"] = event_id
            service.events().insert(calendarId=calendar_id, body=event_body).execute()
        else:
            raise


def _delete_event_sync(
    creds: Credentials, calendar_id: str, event_id: str
) -> None:
    service = _get_service(creds)
    try:
        service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
    except HttpError as e:
        if e.resp.status != 404:
            raise


# ── High-Level Sync Functions ─────────────────────────────────────────────

async def _get_gcal_integration(user_id: int, db: AsyncSession):
    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == user_id,
            UserIntegration.type == "google_calendar",
            UserIntegration.enabled == True,
        )
    )
    return result.scalar_one_or_none()


async def sync_todo_to_gcal(todo_id: int, todo_text: str, todo_due_date, todo_completed: bool, user_id: int, db: AsyncSession) -> None:
    integration = await _get_gcal_integration(user_id, db)
    if not integration:
        return

    try:
        creds = await _ensure_fresh_credentials(integration, db)
    except Exception:
        return

    config = json.loads(integration.config or "{}")
    cal_id = config.get("google_calendar_id")
    if not cal_id:
        return

    event_id = f"hangaitodo{todo_id}"

    if todo_due_date is None:
        # No due date — delete the event if it exists
        try:
            await asyncio.to_thread(_delete_event_sync, creds, cal_id, event_id)
        except Exception as e:
            logger.warning("Failed to delete gcal event %s: %s", event_id, e)
        return

    date_str = todo_due_date.isoformat() if hasattr(todo_due_date, 'isoformat') else str(todo_due_date)
    status = " [done]" if todo_completed else ""
    event_body = {
        "summary": f"{todo_text}{status}",
        "start": {"date": date_str},
        "end": {"date": date_str},
        "transparency": "transparent",
    }

    try:
        await asyncio.to_thread(_upsert_event_sync, creds, cal_id, event_id, event_body)
    except Exception as e:
        logger.warning("Failed to sync todo %s to gcal: %s", todo_id, e)


async def delete_todo_from_gcal(todo_id: int, user_id: int, db: AsyncSession) -> None:
    integration = await _get_gcal_integration(user_id, db)
    if not integration:
        return

    try:
        creds = await _ensure_fresh_credentials(integration, db)
    except Exception:
        return

    config = json.loads(integration.config or "{}")
    cal_id = config.get("google_calendar_id")
    if not cal_id:
        return

    event_id = f"hangaitodo{todo_id}"
    try:
        await asyncio.to_thread(_delete_event_sync, creds, cal_id, event_id)
    except Exception as e:
        logger.warning("Failed to delete gcal event %s: %s", event_id, e)


async def sync_studyplan_item_to_gcal(item_id: int, topic: str, item_date, description: str, completed: bool, user_id: int, db: AsyncSession) -> None:
    integration = await _get_gcal_integration(user_id, db)
    if not integration:
        return

    try:
        creds = await _ensure_fresh_credentials(integration, db)
    except Exception:
        return

    config = json.loads(integration.config or "{}")
    cal_id = config.get("google_calendar_id")
    if not cal_id:
        return

    event_id = f"hangaispi{item_id}"
    date_str = item_date.isoformat() if hasattr(item_date, 'isoformat') else str(item_date)
    status = " [done]" if completed else ""
    event_body = {
        "summary": f"Study: {topic}{status}",
        "description": description or "",
        "start": {"date": date_str},
        "end": {"date": date_str},
        "transparency": "transparent",
    }

    try:
        await asyncio.to_thread(_upsert_event_sync, creds, cal_id, event_id, event_body)
    except Exception as e:
        logger.warning("Failed to sync study plan item %s to gcal: %s", item_id, e)


async def sync_flashcard_batch_to_gcal(user_id: int, target_date: date, count: int, db: AsyncSession) -> None:
    integration = await _get_gcal_integration(user_id, db)
    if not integration:
        return

    try:
        creds = await _ensure_fresh_credentials(integration, db)
    except Exception:
        return

    config = json.loads(integration.config or "{}")
    cal_id = config.get("google_calendar_id")
    if not cal_id:
        return

    event_id = f"hangaifc{target_date.strftime('%Y%m%d')}"

    if count == 0:
        try:
            await asyncio.to_thread(_delete_event_sync, creds, cal_id, event_id)
        except Exception:
            pass
        return

    date_str = target_date.isoformat()
    event_body = {
        "summary": f"Review {count} flashcard{'s' if count != 1 else ''}",
        "start": {"date": date_str},
        "end": {"date": date_str},
        "transparency": "transparent",
    }

    try:
        await asyncio.to_thread(_upsert_event_sync, creds, cal_id, event_id, event_body)
    except Exception as e:
        logger.warning("Failed to sync flashcard batch to gcal: %s", e)


async def full_sync(user_id: int, db: AsyncSession) -> None:
    """Delete and recreate the Neuronic calendar, then sync all data."""
    from app.flashcards.models import Flashcard
    from app.todos.models import TodoItem
    from app.studyplan.models import StudyPlan, StudyPlanItem

    integration = await _get_gcal_integration(user_id, db)
    if not integration:
        return

    try:
        creds = await _ensure_fresh_credentials(integration, db)
    except Exception:
        return

    config = json.loads(integration.config or "{}")
    old_cal_id = config.get("google_calendar_id")

    # Delete old calendar
    if old_cal_id:
        try:
            await asyncio.to_thread(_delete_hang_calendar_sync, creds, old_cal_id)
        except Exception:
            pass

    # Create new calendar
    try:
        new_cal_id = await asyncio.to_thread(_create_hang_calendar_sync, creds)
    except Exception as e:
        logger.error("Failed to create Neuronic calendar: %s", e)
        return

    config["google_calendar_id"] = new_cal_id
    config.pop("error", None)
    integration.config = json.dumps(config)
    await db.commit()

    today = date.today()

    # Sync todos with due dates
    result = await db.execute(
        select(TodoItem).where(
            TodoItem.user_id == user_id,
            TodoItem.due_date.isnot(None),
            TodoItem.due_date >= today - timedelta(days=7),
        )
    )
    todos = result.scalars().all()
    for todo in todos:
        event_id = f"hangaitodo{todo.id}"
        date_str = todo.due_date.isoformat()
        status = " [done]" if todo.completed else ""
        event_body = {
            "summary": f"{todo.text}{status}",
            "start": {"date": date_str},
            "end": {"date": date_str},
            "transparency": "transparent",
        }
        try:
            await asyncio.to_thread(_upsert_event_sync, creds, new_cal_id, event_id, event_body)
        except Exception as e:
            logger.warning("full_sync: todo %s failed: %s", todo.id, e)

    # Sync active study plan items
    try:
        result = await db.execute(
            select(StudyPlanItem)
            .join(StudyPlan, StudyPlanItem.plan_id == StudyPlan.id)
            .where(
                StudyPlan.user_id == user_id,
                StudyPlan.status == "active",
                StudyPlanItem.date >= today - timedelta(days=1),
            )
        )
        items = result.scalars().all()
        for item in items:
            event_id = f"hangaispi{item.id}"
            date_str = item.date.isoformat()
            status = " [done]" if item.completed else ""
            event_body = {
                "summary": f"Study: {item.topic}{status}",
                "description": item.description or "",
                "start": {"date": date_str},
                "end": {"date": date_str},
                "transparency": "transparent",
            }
            try:
                await asyncio.to_thread(_upsert_event_sync, creds, new_cal_id, event_id, event_body)
            except Exception as e:
                logger.warning("full_sync: study plan item %s failed: %s", item.id, e)
    except Exception:
        pass

    # Sync flashcard due counts for next 14 days
    from sqlalchemy import func as sa_func
    for day_offset in range(14):
        check_date = today + timedelta(days=day_offset)
        day_start = datetime(check_date.year, check_date.month, check_date.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)

        result = await db.execute(
            select(sa_func.count(Flashcard.id)).where(
                Flashcard.user_id == user_id,
                Flashcard.next_review >= day_start,
                Flashcard.next_review < day_end,
            )
        )
        count = result.scalar() or 0
        if count == 0:
            continue

        event_id = f"hangaifc{check_date.strftime('%Y%m%d')}"
        event_body = {
            "summary": f"Review {count} flashcard{'s' if count != 1 else ''}",
            "start": {"date": check_date.isoformat()},
            "end": {"date": check_date.isoformat()},
            "transparency": "transparent",
        }
        try:
            await asyncio.to_thread(_upsert_event_sync, creds, new_cal_id, event_id, event_body)
        except Exception as e:
            logger.warning("full_sync: flashcard batch %s failed: %s", check_date, e)

    logger.info("Full Google Calendar sync completed for user %s", user_id)
