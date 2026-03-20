"""Background tasks — Celery if available, otherwise called directly."""

import logging
from app.celery_app import celery_app

_logger = logging.getLogger(__name__)


def _get_sync_session():
    """Create a synchronous database session for Celery workers."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings
    # Convert async URL to sync
    sync_url = settings.DATABASE_URL.replace("+aiosqlite", "").replace("+asyncpg", "")
    engine = create_engine(sync_url)
    Session = sessionmaker(bind=engine)
    return Session()


if celery_app:
    @celery_app.task(name="embed_document", bind=True, max_retries=3)
    def embed_document_task(self, document_id: int, user_id: int):
        """Embed a document for semantic search."""
        try:
            from app.search.service import embed_document_sync
            session = _get_sync_session()
            try:
                embed_document_sync(document_id, user_id, session)
                session.commit()
            finally:
                session.close()
        except Exception as exc:
            _logger.error("embed_document_task failed: %s", exc)
            raise self.retry(exc=exc, countdown=30)

    @celery_app.task(name="sync_gcal_todo", max_retries=2)
    def sync_gcal_todo_task(todo_id: int, text: str, due_date: str, completed: bool, user_id: int):
        """Sync a todo to Google Calendar."""
        import asyncio
        from app.database import async_session
        from app.integrations.google_calendar import sync_todo_to_gcal
        from datetime import date as date_type

        async def _run():
            async with async_session() as s:
                due = date_type.fromisoformat(due_date) if due_date else None
                await sync_todo_to_gcal(todo_id, text, due, completed, user_id, s)

        asyncio.run(_run())

    @celery_app.task(name="sync_gcal_full", max_retries=1)
    def sync_gcal_full_task(user_id: int):
        """Full Google Calendar sync."""
        import asyncio
        from app.database import async_session
        from app.integrations.google_calendar import full_sync

        async def _run():
            async with async_session() as s:
                await full_sync(user_id, s)

        asyncio.run(_run())

    @celery_app.task(name="delete_gcal_todo", max_retries=2)
    def delete_gcal_todo_task(todo_id: int, user_id: int):
        """Delete a todo from Google Calendar."""
        import asyncio
        from app.database import async_session
        from app.integrations.google_calendar import delete_todo_from_gcal

        async def _run():
            async with async_session() as s:
                await delete_todo_from_gcal(todo_id, user_id, s)

        asyncio.run(_run())

    @celery_app.task(name="sync_gcal_studyplan_item", max_retries=2)
    def sync_gcal_studyplan_item_task(
        item_id: int, topic: str, item_date: str, description: str, completed: bool, user_id: int
    ):
        """Sync a study plan item to Google Calendar."""
        import asyncio
        from datetime import date as date_type
        from app.database import async_session
        from app.integrations.google_calendar import sync_studyplan_item_to_gcal

        async def _run():
            async with async_session() as s:
                d = date_type.fromisoformat(item_date) if item_date else None
                await sync_studyplan_item_to_gcal(item_id, topic, d, description, completed, user_id, s)

        asyncio.run(_run())
