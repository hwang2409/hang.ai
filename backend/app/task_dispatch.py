"""Dispatch background tasks to Celery or FastAPI BackgroundTasks."""

from typing import Optional
from fastapi import BackgroundTasks
from app.celery_app import celery_app


def dispatch_embed_document(
    document_id: int,
    user_id: int,
    background_tasks: Optional[BackgroundTasks] = None,
):
    if celery_app:
        from app.tasks import embed_document_task
        embed_document_task.delay(document_id, user_id)
    elif background_tasks:
        async def _run():
            from app.database import async_session
            from app.search.service import embed_document_background
            async with async_session() as s:
                await embed_document_background(document_id, user_id, s)
        background_tasks.add_task(_run)


def dispatch_gcal_todo_sync(
    todo_id: int,
    text: str,
    due_date,
    completed: bool,
    user_id: int,
    background_tasks: Optional[BackgroundTasks] = None,
):
    due_str = due_date.isoformat() if due_date and hasattr(due_date, 'isoformat') else str(due_date) if due_date else ""
    if celery_app:
        from app.tasks import sync_gcal_todo_task
        sync_gcal_todo_task.delay(todo_id, text, due_str, completed, user_id)
    elif background_tasks:
        async def _sync():
            from app.database import async_session
            from app.integrations.google_calendar import sync_todo_to_gcal
            async with async_session() as s:
                await sync_todo_to_gcal(todo_id, text, due_date, completed, user_id, s)
        background_tasks.add_task(_sync)


def dispatch_gcal_delete_todo(
    todo_id: int,
    user_id: int,
    background_tasks: Optional[BackgroundTasks] = None,
):
    if celery_app:
        from app.tasks import delete_gcal_todo_task
        delete_gcal_todo_task.delay(todo_id, user_id)
    elif background_tasks:
        async def _sync():
            from app.database import async_session
            from app.integrations.google_calendar import delete_todo_from_gcal
            async with async_session() as s:
                await delete_todo_from_gcal(todo_id, user_id, s)
        background_tasks.add_task(_sync)


def dispatch_gcal_full_sync(
    user_id: int,
    background_tasks: Optional[BackgroundTasks] = None,
):
    if celery_app:
        from app.tasks import sync_gcal_full_task
        sync_gcal_full_task.delay(user_id)
    elif background_tasks:
        async def _sync():
            from app.database import async_session
            from app.integrations.google_calendar import full_sync
            async with async_session() as s:
                await full_sync(user_id, s)
        background_tasks.add_task(_sync)


def dispatch_gcal_studyplan_item_sync(
    item_id: int,
    topic: str,
    item_date,
    description: str,
    completed: bool,
    user_id: int,
    background_tasks: Optional[BackgroundTasks] = None,
):
    date_str = item_date.isoformat() if item_date and hasattr(item_date, 'isoformat') else str(item_date) if item_date else ""
    if celery_app:
        from app.tasks import sync_gcal_studyplan_item_task
        sync_gcal_studyplan_item_task.delay(item_id, topic, date_str, description, completed, user_id)
    elif background_tasks:
        async def _sync():
            from app.database import async_session
            from app.integrations.google_calendar import sync_studyplan_item_to_gcal
            async with async_session() as s:
                await sync_studyplan_item_to_gcal(item_id, topic, item_date, description, completed, user_id, s)
        background_tasks.add_task(_sync)
