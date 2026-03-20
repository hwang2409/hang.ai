import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse, Response
from jose import jwt as jose_jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_db, get_current_user
from app.auth.models import User
from app.integrations.models import UserIntegration
from app.integrations.schemas import (
    CalendarFeedCreate,
    GoogleCalendarAuthorizeResponse,
    IntegrationResponse,
    SyncResponse,
    WebhookCreate,
    WebhookTestResponse,
    WebhookUpdate,
)
from app.integrations.calendar import generate_ical_feed
from app.integrations.webhook import fire_test_webhook

router = APIRouter()


def _to_response(integration: UserIntegration) -> IntegrationResponse:
    config = {}
    try:
        config = json.loads(integration.config or "{}")
    except (json.JSONDecodeError, TypeError):
        pass
    return IntegrationResponse(
        id=integration.id,
        type=integration.type,
        enabled=integration.enabled,
        token=integration.token,
        config=config,
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


# ── List all integrations ────────────────────────────────────────────────

@router.get("", response_model=list[IntegrationResponse])
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserIntegration)
        .where(UserIntegration.user_id == current_user.id)
        .order_by(UserIntegration.created_at)
    )
    return [_to_response(i) for i in result.scalars().all()]


# ── Calendar Feed ────────────────────────────────────────────────────────

@router.post("/calendar", response_model=IntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_calendar_feed(
    body: CalendarFeedCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check if one already exists
    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == current_user.id,
            UserIntegration.type == "calendar_feed",
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return _to_response(existing)

    integration = UserIntegration(
        user_id=current_user.id,
        type="calendar_feed",
        token=uuid.uuid4().hex,
        config="{}",
    )
    db.add(integration)
    await db.commit()
    await db.refresh(integration)
    return _to_response(integration)


@router.get("/calendar/feed/{token}.ics")
async def get_calendar_feed(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — no auth required. Calendar apps use static URLs."""
    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.token == token,
            UserIntegration.type == "calendar_feed",
            UserIntegration.enabled == True,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Calendar feed not found")

    ical_str = await generate_ical_feed(integration.user_id, db)
    return Response(
        content=ical_str,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=hang-study.ics"},
    )


@router.delete("/calendar", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar_feed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == current_user.id,
            UserIntegration.type == "calendar_feed",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="No calendar feed configured")

    await db.delete(integration)
    await db.commit()


@router.post("/calendar/regenerate", response_model=IntegrationResponse)
async def regenerate_calendar_token(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == current_user.id,
            UserIntegration.type == "calendar_feed",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="No calendar feed configured")

    integration.token = uuid.uuid4().hex
    await db.commit()
    await db.refresh(integration)
    return _to_response(integration)


# ── Webhooks ─────────────────────────────────────────────────────────────

@router.post("/webhook", response_model=IntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    body: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = {
        "url": body.url,
        "events": body.events,
    }
    integration = UserIntegration(
        user_id=current_user.id,
        type="webhook",
        token=uuid.uuid4().hex,
        config=json.dumps(config),
    )
    db.add(integration)
    await db.commit()
    await db.refresh(integration)
    return _to_response(integration)


@router.put("/webhook/{integration_id}", response_model=IntegrationResponse)
async def update_webhook(
    integration_id: int,
    body: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.id == integration_id,
            UserIntegration.user_id == current_user.id,
            UserIntegration.type == "webhook",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Webhook not found")

    config = {}
    try:
        config = json.loads(integration.config or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    if body.url is not None:
        config["url"] = body.url
    if body.events is not None:
        config["events"] = body.events
    if body.enabled is not None:
        integration.enabled = body.enabled

    integration.config = json.dumps(config)
    await db.commit()
    await db.refresh(integration)
    return _to_response(integration)


@router.delete("/webhook/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    integration_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.id == integration_id,
            UserIntegration.user_id == current_user.id,
            UserIntegration.type == "webhook",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Webhook not found")

    await db.delete(integration)
    await db.commit()


@router.post("/webhook/{integration_id}/test", response_model=WebhookTestResponse)
async def test_webhook(
    integration_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.id == integration_id,
            UserIntegration.user_id == current_user.id,
            UserIntegration.type == "webhook",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Webhook not found")

    config = {}
    try:
        config = json.loads(integration.config or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    url = config.get("url")
    if not url:
        return WebhookTestResponse(success=False, error="No URL configured")

    success, status_code, error = await fire_test_webhook(url)
    return WebhookTestResponse(success=success, status_code=status_code, error=error)


# ── Google Calendar OAuth ─────────────────────────────────────────────────

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar"


@router.get("/google-calendar/authorize", response_model=GoogleCalendarAuthorizeResponse)
async def google_calendar_authorize(
    current_user: User = Depends(get_current_user),
):
    """Generate Google OAuth URL. Frontend redirects browser to this URL."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google Calendar integration not configured")

    # Encode user_id in state as a JWT (signed, 5-min expiry)
    state_payload = {
        "sub": str(current_user.id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    state = jose_jwt.encode(state_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": GOOGLE_CALENDAR_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    authorize_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return GoogleCalendarAuthorizeResponse(authorize_url=authorize_url)


@router.get("/google-calendar/callback")
async def google_calendar_callback(
    code: str = Query(...),
    state: str = Query(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
):
    """OAuth callback — browser redirect from Google. No auth header (state JWT instead)."""
    import httpx

    # Decode state to get user_id
    try:
        payload = jose_jwt.decode(state, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = int(payload.get("sub", 0))
        if not user_id:
            raise HTTPException(status_code=400, detail="Invalid state")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired state parameter")

    # Exchange code for tokens
    token_data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data=token_data)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange authorization code")
        tokens = resp.json()

    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)

    if not access_token:
        raise HTTPException(status_code=400, detail="No access token received")

    token_expiry = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()

    config = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_expiry": token_expiry,
        "google_calendar_id": None,
    }

    # Check for existing integration
    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == user_id,
            UserIntegration.type == "google_calendar",
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.config = json.dumps(config)
        existing.enabled = True
        integration = existing
    else:
        integration = UserIntegration(
            user_id=user_id,
            type="google_calendar",
            token=uuid.uuid4().hex,
            config=json.dumps(config),
        )
        db.add(integration)

    await db.commit()
    await db.refresh(integration)

    # Create the Hang.ai calendar and run full sync in background
    async def _setup_and_sync():
        from app.database import async_session
        from app.integrations.google_calendar import (
            _ensure_fresh_credentials,
            _create_hang_calendar_sync,
            full_sync,
        )
        async with async_session() as s:
            result = await s.execute(
                select(UserIntegration).where(UserIntegration.id == integration.id)
            )
            integ = result.scalar_one_or_none()
            if not integ:
                return

            try:
                creds = await _ensure_fresh_credentials(integ, s)
                cal_id = await asyncio.to_thread(_create_hang_calendar_sync, creds)
                cfg = json.loads(integ.config or "{}")
                cfg["google_calendar_id"] = cal_id
                integ.config = json.dumps(cfg)
                await s.commit()

                await full_sync(user_id, s)
            except Exception as e:
                import logging
                logging.getLogger(__name__).error("Google Calendar setup failed: %s", e)

    background_tasks.add_task(_setup_and_sync)

    return RedirectResponse(url=f"{settings.FRONTEND_URL}/integrations?gcal=connected")


@router.delete("/google-calendar", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_google_calendar(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == current_user.id,
            UserIntegration.type == "google_calendar",
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Google Calendar not connected")

    # Best-effort delete the Hang.ai calendar from Google
    try:
        config = json.loads(integration.config or "{}")
        cal_id = config.get("google_calendar_id")
        if cal_id:
            from app.integrations.google_calendar import (
                _ensure_fresh_credentials,
                _delete_hang_calendar_sync,
            )
            creds = await _ensure_fresh_credentials(integration, db)
            await asyncio.to_thread(_delete_hang_calendar_sync, creds, cal_id)
    except Exception:
        pass  # Best effort

    await db.delete(integration)
    await db.commit()


@router.post("/google-calendar/sync", response_model=SyncResponse)
async def trigger_google_calendar_sync(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == current_user.id,
            UserIntegration.type == "google_calendar",
            UserIntegration.enabled == True,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Google Calendar not connected")

    async def _run_sync():
        from app.database import async_session
        from app.integrations.google_calendar import full_sync
        async with async_session() as s:
            await full_sync(current_user.id, s)

    background_tasks.add_task(_run_sync)
    return SyncResponse(status="sync_started")
