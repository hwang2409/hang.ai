"""
Shared test fixtures for the Neuronic backend test suite.

Provides:
- In-memory SQLite async database (per-test isolation)
- httpx.AsyncClient wired to the FastAPI app via ASGITransport
- Authenticated header helpers (two separate users)
"""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# ---------------------------------------------------------------------------
# Database fixture — fresh in-memory SQLite per test
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def setup_db():
    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
    )
    test_session_factory = async_sessionmaker(test_engine, expire_on_commit=False)

    # Import Base and every model module so metadata is populated.
    from app.database import Base
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

    # Create all tables in the test database
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Override the get_db dependency so all request-scoped DB access uses the
    # test engine.
    from app.main import app as fastapi_app
    from app.deps import get_db

    async def override_get_db():
        async with test_session_factory() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = override_get_db

    # Patch `app.database.async_session` so that background tasks (which open
    # their own sessions via `async_session()`) also hit the test database.
    import app.database as db_module
    original_session = db_module.async_session
    db_module.async_session = test_session_factory

    yield test_session_factory

    # Cleanup
    fastapi_app.dependency_overrides.clear()
    db_module.async_session = original_session
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


# ---------------------------------------------------------------------------
# ASGI test client — wraps the FastAPI app, bypasses lifespan to avoid heavy
# startup tasks (fastembed model loading, plugin discovery, Redis).
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def client(setup_db):
    from app.main import app as fastapi_app

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# Auth helpers — register users through the API and return Bearer headers
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    resp = await client.post("/auth/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "testpass123",
    })
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def second_user_headers(client: AsyncClient) -> dict[str, str]:
    resp = await client.post("/auth/register", json={
        "email": "second@example.com",
        "username": "seconduser",
        "password": "testpass456",
    })
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
