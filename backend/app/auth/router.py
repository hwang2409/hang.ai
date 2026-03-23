import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.crypto import encrypt_api_key, decrypt_api_key
from app.deps import get_db, get_current_user
from app.auth.models import User
from app.auth.schemas import RegisterRequest, LoginRequest, TokenResponse, UserResponse, UserUpdateRequest, ProfileResponse

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check email uniqueness
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check username uniqueness
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        email=body.email.lower(),
        username=body.username,
        hashed_password=pwd_context.hash(body.password),
    )
    db.add(user)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Email or username already taken")
    await db.refresh(user)

    return TokenResponse(access_token=create_token(user.id))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    # Always verify against a hash to prevent timing attacks
    dummy_hash = "$2b$12$LJ3m4ys3Lz0gHR0sCisIBOo0XMCRmKNKPYUFBNllmUk0vuIRBBKmy"
    pwd_context.verify(body.password, user.hashed_password if user else dummy_hash)
    if not user or not pwd_context.verify(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return TokenResponse(access_token=create_token(user.id))


def _key_hint(encrypted: str | None) -> str | None:
    """Return a masked hint like 'sk-a...t123' or None."""
    if not encrypted:
        return None
    try:
        plain = decrypt_api_key(encrypted)
        if len(plain) <= 8:
            return plain[:2] + "..." + plain[-2:]
        return plain[:4] + "..." + plain[-4:]
    except Exception:
        return None


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        is_admin=user.is_admin,
        vim_enabled=user.vim_enabled,
        theme=user.theme,
        editor_font_size=user.editor_font_size,
        default_note_type=user.default_note_type,
        pomodoro_focus=user.pomodoro_focus,
        pomodoro_short_break=user.pomodoro_short_break,
        pomodoro_long_break=user.pomodoro_long_break,
        reputation=user.reputation,
        bio=user.bio,
        anthropic_api_key_set=bool(user.encrypted_anthropic_key),
        anthropic_api_key_hint=_key_hint(user.encrypted_anthropic_key),
        openai_api_key_set=bool(user.encrypted_openai_key),
        openai_api_key_hint=_key_hint(user.encrypted_openai_key),
        nudge_preferences=json.loads(user.nudge_preferences or "{}"),
        contextual_ai=user.contextual_ai,
        created_at=user.created_at,
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return _user_response(current_user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.vim_enabled is not None:
        current_user.vim_enabled = body.vim_enabled
    if body.theme is not None:
        current_user.theme = body.theme
    if body.editor_font_size is not None:
        current_user.editor_font_size = body.editor_font_size
    if body.default_note_type is not None:
        current_user.default_note_type = body.default_note_type
    if body.pomodoro_focus is not None:
        current_user.pomodoro_focus = body.pomodoro_focus
    if body.pomodoro_short_break is not None:
        current_user.pomodoro_short_break = body.pomodoro_short_break
    if body.pomodoro_long_break is not None:
        current_user.pomodoro_long_break = body.pomodoro_long_break
    if body.bio is not None:
        current_user.bio = body.bio
    if body.anthropic_api_key is not None:
        if body.anthropic_api_key == "":
            current_user.encrypted_anthropic_key = None
        else:
            current_user.encrypted_anthropic_key = encrypt_api_key(body.anthropic_api_key)
    if body.openai_api_key is not None:
        if body.openai_api_key == "":
            current_user.encrypted_openai_key = None
        else:
            current_user.encrypted_openai_key = encrypt_api_key(body.openai_api_key)
    if body.nudge_preferences is not None:
        current_user.nudge_preferences = json.dumps(body.nudge_preferences)
    if body.contextual_ai is not None:
        current_user.contextual_ai = body.contextual_ai
    await db.commit()
    await db.refresh(current_user)
    return _user_response(current_user)


@router.get("/users/{user_id}/profile", response_model=ProfileResponse)
async def get_profile(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.forum.models import ForumQuestion, ForumAnswer

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    q_count = await db.execute(
        select(sa_func.count(ForumQuestion.id)).where(ForumQuestion.user_id == user_id)
    )
    question_count = q_count.scalar() or 0

    a_count = await db.execute(
        select(sa_func.count(ForumAnswer.id)).where(ForumAnswer.user_id == user_id)
    )
    answer_count = a_count.scalar() or 0

    acc_count = await db.execute(
        select(sa_func.count(ForumAnswer.id)).where(
            ForumAnswer.user_id == user_id,
            ForumAnswer.is_accepted == True,  # noqa: E712
        )
    )
    accepted_answer_count = acc_count.scalar() or 0

    return ProfileResponse(
        id=user.id,
        username=user.username,
        bio=getattr(user, 'bio', None),
        reputation=getattr(user, 'reputation', 1) or 1,
        question_count=question_count,
        answer_count=answer_count,
        accepted_answer_count=accepted_answer_count,
        created_at=user.created_at,
    )


@router.put("/profile", response_model=ProfileResponse)
async def update_profile(
    body: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.forum.models import ForumQuestion, ForumAnswer

    if body.bio is not None:
        current_user.bio = body.bio
    await db.commit()
    await db.refresh(current_user)

    q_count = await db.execute(
        select(sa_func.count(ForumQuestion.id)).where(ForumQuestion.user_id == current_user.id)
    )
    question_count = q_count.scalar() or 0

    a_count = await db.execute(
        select(sa_func.count(ForumAnswer.id)).where(ForumAnswer.user_id == current_user.id)
    )
    answer_count = a_count.scalar() or 0

    acc_count = await db.execute(
        select(sa_func.count(ForumAnswer.id)).where(
            ForumAnswer.user_id == current_user.id,
            ForumAnswer.is_accepted == True,  # noqa: E712
        )
    )
    accepted_answer_count = acc_count.scalar() or 0

    return ProfileResponse(
        id=current_user.id,
        username=current_user.username,
        bio=getattr(current_user, 'bio', None),
        reputation=getattr(current_user, 'reputation', 1) or 1,
        question_count=question_count,
        answer_count=answer_count,
        accepted_answer_count=accepted_answer_count,
        created_at=current_user.created_at,
    )
