from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
)

async_session = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    # Import all model modules so tables are registered with Base.metadata
    import app.auth.models  # noqa: F401
    import app.notes.models  # noqa: F401
    import app.llm.models  # noqa: F401
    import app.flashcards.models  # noqa: F401
    import app.feynman.models  # noqa: F401
    import app.annotations.models  # noqa: F401
    import app.search.models  # noqa: F401
    import app.pomodoro.models  # noqa: F401
    import app.todos.models  # noqa: F401
    import app.files.models  # noqa: F401
    import app.file_annotations.models  # noqa: F401
    import app.studyplan.models  # noqa: F401
    import app.lookups.models  # noqa: F401
    import app.quizzes.models  # noqa: F401
    import app.integrations.models  # noqa: F401
    import app.social.models  # noqa: F401
    import app.forum.models  # noqa: F401
    import app.notifications.models  # noqa: F401
    import app.knowledge.models  # noqa: F401
    import app.automations.models  # noqa: F401
    import app.reviews.models  # noqa: F401
    import app.plugins.models  # noqa: F401

    from app.plugins.loader import discover_plugins
    discover_plugins()

    async with engine.begin() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        await conn.execute(text("PRAGMA foreign_keys=ON"))
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text(
                "ALTER TABLE documents ADD COLUMN type VARCHAR(20) DEFAULT 'text'"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE conversation_threads ADD COLUMN file_id INTEGER REFERENCES uploaded_files(id)"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE uploaded_files ADD COLUMN source_url VARCHAR(2000)"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE todo_items ADD COLUMN priority INTEGER DEFAULT 0"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN vim_enabled BOOLEAN DEFAULT 0"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN theme VARCHAR(10) DEFAULT 'dark'"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN editor_font_size VARCHAR(10) DEFAULT 'normal'"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN default_note_type VARCHAR(20) DEFAULT 'text'"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN pomodoro_focus INTEGER DEFAULT 25"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN pomodoro_short_break INTEGER DEFAULT 5"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN pomodoro_long_break INTEGER DEFAULT 15"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE documents ADD COLUMN share_token VARCHAR(64)"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE group_shared_notes ADD COLUMN permission VARCHAR(10) DEFAULT 'view'"
            ))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text(
                "ALTER TABLE forum_questions ADD COLUMN downvote_count INTEGER DEFAULT 0"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE forum_answers ADD COLUMN downvote_count INTEGER DEFAULT 0"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE forum_votes ADD COLUMN direction INTEGER DEFAULT 1"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE group_messages ADD COLUMN is_pinned INTEGER DEFAULT 0"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE forum_questions ADD COLUMN status VARCHAR(20) DEFAULT 'open'"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE forum_questions ADD COLUMN duplicate_of_id INTEGER REFERENCES forum_questions(id)"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE forum_questions ADD COLUMN bounty INTEGER DEFAULT 0"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE forum_questions ADD COLUMN bounty_expires_at DATETIME"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN reputation INTEGER DEFAULT 1"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN bio TEXT"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN encrypted_anthropic_key TEXT"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN encrypted_openai_key TEXT"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN nudge_preferences TEXT DEFAULT '{}'"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN contextual_ai BOOLEAN DEFAULT 1"
            ))
        except Exception:
            pass
