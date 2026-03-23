from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    is_admin: bool = False
    vim_enabled: bool = False
    theme: str = "dark"
    editor_font_size: str = "normal"
    default_note_type: str = "text"
    pomodoro_focus: int = 25
    pomodoro_short_break: int = 5
    pomodoro_long_break: int = 15
    reputation: int = 1
    bio: str | None = None
    anthropic_api_key_set: bool = False
    anthropic_api_key_hint: str | None = None
    openai_api_key_set: bool = False
    openai_api_key_hint: str | None = None
    nudge_preferences: dict = {}
    contextual_ai: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdateRequest(BaseModel):
    vim_enabled: bool | None = None
    theme: str | None = None
    editor_font_size: str | None = None
    default_note_type: str | None = None
    pomodoro_focus: int | None = None
    pomodoro_short_break: int | None = None
    pomodoro_long_break: int | None = None
    bio: str | None = None
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    nudge_preferences: dict | None = None
    contextual_ai: bool | None = None


class ProfileResponse(BaseModel):
    id: int
    username: str
    bio: str | None = None
    reputation: int = 1
    question_count: int = 0
    answer_count: int = 0
    accepted_answer_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}
