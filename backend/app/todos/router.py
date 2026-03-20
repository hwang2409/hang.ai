from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.todos.models import TodoItem
from app.todos.schemas import TodoCreate, TodoUpdate, TodoResponse
from app.cache import cache_delete_pattern

router = APIRouter()


@router.get("", response_model=list[TodoResponse])
async def list_todos(
    completed: bool | None = Query(None),
    sort: str = Query("created"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(TodoItem).where(TodoItem.user_id == current_user.id)
    if completed is not None:
        stmt = stmt.where(TodoItem.completed == completed)
    if sort == "due_date":
        stmt = stmt.order_by(TodoItem.due_date.asc().nullslast(), TodoItem.created_at.desc())
    elif sort == "priority":
        stmt = stmt.order_by(TodoItem.priority.desc(), TodoItem.created_at.desc())
    else:
        stmt = stmt.order_by(TodoItem.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=TodoResponse, status_code=201)
async def create_todo(
    body: TodoCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    todo = TodoItem(
        user_id=current_user.id,
        text=body.text,
        due_date=body.due_date,
        priority=body.priority,
    )
    db.add(todo)
    await db.commit()
    await db.refresh(todo)
    await cache_delete_pattern(f"dashboard:*:{current_user.id}")

    if todo.due_date is not None:
        from app.task_dispatch import dispatch_gcal_todo_sync
        dispatch_gcal_todo_sync(todo.id, todo.text, todo.due_date, todo.completed, current_user.id, background_tasks)

    return todo


@router.put("/{todo_id}", response_model=TodoResponse)
async def update_todo(
    todo_id: int,
    body: TodoUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TodoItem).where(
            TodoItem.id == todo_id,
            TodoItem.user_id == current_user.id,
        )
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    if body.text is not None:
        todo.text = body.text
    if body.completed is not None:
        todo.completed = body.completed
    if body.due_date is not None:
        todo.due_date = body.due_date
    if body.priority is not None:
        todo.priority = body.priority
    await db.commit()
    await db.refresh(todo)
    await cache_delete_pattern(f"dashboard:*:{current_user.id}")

    from app.task_dispatch import dispatch_gcal_todo_sync
    dispatch_gcal_todo_sync(todo.id, todo.text, todo.due_date, todo.completed, current_user.id, background_tasks)

    return todo


@router.delete("/{todo_id}", status_code=204)
async def delete_todo(
    todo_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TodoItem).where(
            TodoItem.id == todo_id,
            TodoItem.user_id == current_user.id,
        )
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    _todo_id, _uid = todo.id, current_user.id
    await db.delete(todo)
    await db.commit()
    await cache_delete_pattern(f"dashboard:*:{current_user.id}")

    from app.task_dispatch import dispatch_gcal_delete_todo
    dispatch_gcal_delete_todo(_todo_id, _uid, background_tasks)
