from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: str
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
