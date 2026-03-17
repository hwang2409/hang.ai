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
