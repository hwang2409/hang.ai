import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

_logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./hang.db"
    JWT_SECRET: str = "dev-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"
    SEARXNG_URL: str = "http://localhost:8888"
    OPENAI_API_KEY: str = ""
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/integrations/google-calendar/callback"
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    REDIS_URL: str = ""  # e.g. "redis://localhost:6379/0"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()


def check_settings() -> None:
    """Log warnings for insecure defaults. Called once from app lifespan."""
    if settings.JWT_SECRET == "dev-secret-change-me":
        _logger.warning("JWT_SECRET is using the default value — set a secure secret in .env for production")
