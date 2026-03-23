import json
from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.cache import cache_delete_pattern
from app.studyplan.models import StudyPlan, StudyPlanItem
from app.studyplan.schemas import (
    StudyPlanGenerate,
    StudyPlanItemResponse,
    StudyPlanItemUpdate,
    StudyPlanListItem,
    StudyPlanResponse,
)
from app.todos.models import TodoItem
from app.crypto import decrypt_api_key
from app.llm.service import evaluate_text
from app.llm.context import get_learner_context, inject_learner_context

router = APIRouter()


def _parse_llm_json(raw: str) -> dict:
    """Strip markdown code fences if present, then parse JSON."""
    text = raw.strip()
    if text.startswith("```"):
        # Remove opening fence (```json or ```)
        first_newline = text.index("\n")
        text = text[first_newline + 1 :]
        # Remove closing fence
        if text.endswith("```"):
            text = text[: -3]
        text = text.strip()
    return json.loads(text)


@router.post("/generate", response_model=StudyPlanResponse, status_code=201)
async def generate_study_plan(
    body: StudyPlanGenerate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prompt = f"""Given this syllabus and exam date ({body.exam_date.isoformat()}), create a study plan.

Syllabus:
{body.syllabus_text}

Respond with ONLY a JSON object (no markdown, no explanation):
{{"days": [{{"day": 1, "date": "YYYY-MM-DD", "topic": "...", "description": "...", "duration_hours": 2}}]}}

Rules:
- Start from tomorrow or today's date
- End by the exam date
- Distribute topics evenly
- Front-load foundational concepts
- Include review days before the exam
- Keep descriptions actionable and specific"""

    api_key = None
    if current_user.encrypted_anthropic_key:
        try:
            api_key = decrypt_api_key(current_user.encrypted_anthropic_key)
        except Exception:
            pass

    learner_ctx = await get_learner_context(db, current_user)
    from app.llm.prompts import VOICE
    system = inject_learner_context(VOICE, learner_ctx)

    raw_response = await evaluate_text(prompt, system_prompt=system, api_key=api_key)

    try:
        plan_data = _parse_llm_json(raw_response)
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(
            status_code=500,
            detail="Failed to parse study plan from AI response",
        )

    days = plan_data.get("days", [])
    if not days:
        raise HTTPException(
            status_code=500,
            detail="AI returned an empty study plan",
        )

    # Create the study plan
    plan = StudyPlan(
        user_id=current_user.id,
        title=body.title,
        exam_date=body.exam_date,
        syllabus_text=body.syllabus_text,
        plan_json=json.dumps(plan_data),
    )
    db.add(plan)
    await db.flush()  # get plan.id

    items = []
    for day_entry in days:
        day_number = day_entry.get("day", 0)
        day_date_str = day_entry.get("date", "")
        topic = day_entry.get("topic", "")
        description = day_entry.get("description", "")

        try:
            day_date = date.fromisoformat(day_date_str)
        except (ValueError, TypeError):
            # Fall back to computing date from day_number
            day_date = date.today() + timedelta(days=day_number - 1)

        # Create a linked TodoItem for this study day
        todo = TodoItem(
            user_id=current_user.id,
            text=f"[Study] {topic}",
            due_date=day_date,
            priority=1,
        )
        db.add(todo)
        await db.flush()  # get todo.id

        item = StudyPlanItem(
            plan_id=plan.id,
            day_number=day_number,
            date=day_date,
            topic=topic,
            description=description,
            todo_id=todo.id,
        )
        db.add(item)
        items.append(item)

    await db.commit()
    await db.refresh(plan)
    for item in items:
        await db.refresh(item)
    await cache_delete_pattern(f"dashboard:*:{current_user.id}")

    # Sync all new items to Google Calendar
    from app.task_dispatch import dispatch_gcal_full_sync
    dispatch_gcal_full_sync(current_user.id, background_tasks)

    return StudyPlanResponse(
        id=plan.id,
        title=plan.title,
        exam_date=plan.exam_date,
        syllabus_text=plan.syllabus_text,
        status=plan.status,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        items=[StudyPlanItemResponse.model_validate(i) for i in items],
    )


@router.get("", response_model=list[StudyPlanListItem])
async def list_study_plans(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plans_stmt = (
        select(StudyPlan)
        .where(StudyPlan.user_id == current_user.id)
        .order_by(StudyPlan.created_at.desc())
    )
    result = await db.execute(plans_stmt)
    plans = result.scalars().all()

    response = []
    for plan in plans:
        # Count total items
        count_result = await db.execute(
            select(sa_func.count(StudyPlanItem.id)).where(
                StudyPlanItem.plan_id == plan.id
            )
        )
        item_count = count_result.scalar() or 0

        # Count completed items
        completed_result = await db.execute(
            select(sa_func.count(StudyPlanItem.id)).where(
                StudyPlanItem.plan_id == plan.id,
                StudyPlanItem.completed == True,
            )
        )
        completed_count = completed_result.scalar() or 0

        response.append(
            StudyPlanListItem(
                id=plan.id,
                title=plan.title,
                exam_date=plan.exam_date,
                status=plan.status,
                created_at=plan.created_at,
                item_count=item_count,
                completed_count=completed_count,
            )
        )

    return response


@router.get("/{plan_id}", response_model=StudyPlanResponse)
async def get_study_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StudyPlan).where(
            StudyPlan.id == plan_id,
            StudyPlan.user_id == current_user.id,
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Study plan not found")

    items_result = await db.execute(
        select(StudyPlanItem)
        .where(StudyPlanItem.plan_id == plan.id)
        .order_by(StudyPlanItem.day_number.asc())
    )
    items = items_result.scalars().all()

    return StudyPlanResponse(
        id=plan.id,
        title=plan.title,
        exam_date=plan.exam_date,
        syllabus_text=plan.syllabus_text,
        status=plan.status,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        items=[StudyPlanItemResponse.model_validate(i) for i in items],
    )


@router.put("/{plan_id}/items/{item_id}", response_model=StudyPlanItemResponse)
async def update_study_plan_item(
    plan_id: int,
    item_id: int,
    body: StudyPlanItemUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify plan belongs to user
    plan_result = await db.execute(
        select(StudyPlan).where(
            StudyPlan.id == plan_id,
            StudyPlan.user_id == current_user.id,
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Study plan not found")

    # Fetch item
    item_result = await db.execute(
        select(StudyPlanItem).where(
            StudyPlanItem.id == item_id,
            StudyPlanItem.plan_id == plan_id,
        )
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Study plan item not found")

    if body.completed is not None:
        item.completed = body.completed

        # Also update the linked todo if it exists (verify ownership)
        if item.todo_id:
            todo_result = await db.execute(
                select(TodoItem).where(
                    TodoItem.id == item.todo_id,
                    TodoItem.user_id == current_user.id,
                )
            )
            todo = todo_result.scalar_one_or_none()
            if todo:
                todo.completed = body.completed

    await db.commit()
    await db.refresh(item)
    await cache_delete_pattern(f"dashboard:*:{current_user.id}")

    from app.task_dispatch import dispatch_gcal_studyplan_item_sync
    dispatch_gcal_studyplan_item_sync(item.id, item.topic, item.date, item.description, item.completed, current_user.id, background_tasks)

    return item


@router.delete("/{plan_id}", status_code=204)
async def delete_study_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StudyPlan).where(
            StudyPlan.id == plan_id,
            StudyPlan.user_id == current_user.id,
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Study plan not found")

    # Delete all items first (cascade should handle this, but be explicit)
    items_result = await db.execute(
        select(StudyPlanItem).where(StudyPlanItem.plan_id == plan.id)
    )
    items = items_result.scalars().all()
    # Delete linked TodoItems to prevent orphans
    for item in items:
        if item.todo_id:
            todo_result = await db.execute(
                select(TodoItem).where(
                    TodoItem.id == item.todo_id,
                    TodoItem.user_id == current_user.id,
                )
            )
            todo = todo_result.scalar_one_or_none()
            if todo:
                await db.delete(todo)
        await db.delete(item)

    await db.delete(plan)
    await db.commit()
