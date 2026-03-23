from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document
from app.cache import cache_delete_pattern
from app.reviews.models import ReviewSchedule
from app.automations.engine import fire_event

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class DueReviewItem(BaseModel):
    id: int
    item_type: str
    item_id: int
    item_label: str
    ease_factor: float
    interval: int
    repetitions: int
    next_review: datetime
    last_reviewed: datetime | None = None
    content_preview: str = ""
    model_config = {"from_attributes": True}


class ReviewStatsResponse(BaseModel):
    total_scheduled: int = 0
    due_now: int = 0
    reviewed_today: int = 0
    mastered: int = 0


class CompleteReviewRequest(BaseModel):
    quality: int = Field(..., ge=0, le=5)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/due", response_model=list[DueReviewItem])
async def get_due_reviews(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return items due for review (next_review <= now), joined with Document for content preview."""
    now = datetime.now(timezone.utc)

    # Fetch due review schedules
    result = await db.execute(
        select(ReviewSchedule)
        .where(
            ReviewSchedule.user_id == current_user.id,
            ReviewSchedule.next_review <= now,
        )
        .order_by(ReviewSchedule.next_review)
        .limit(limit)
    )
    schedules = result.scalars().all()

    if not schedules:
        return []

    # Collect note item_ids to fetch content previews (filter out deleted notes)
    note_ids = [s.item_id for s in schedules if s.item_type == "note"]
    note_previews: dict[int, str] = {}
    if note_ids:
        doc_result = await db.execute(
            select(Document.id, Document.content)
            .where(
                Document.id.in_(note_ids),
                Document.deleted == False,  # noqa: E712
            )
        )
        for row in doc_result.all():
            note_previews[row[0]] = (row[1] or "")[:500]

    # Build response, filtering out deleted notes
    items: list[DueReviewItem] = []
    for s in schedules:
        if s.item_type == "note" and s.item_id not in note_previews:
            continue  # note was deleted
        items.append(DueReviewItem(
            id=s.id,
            item_type=s.item_type,
            item_id=s.item_id,
            item_label=s.item_label,
            ease_factor=s.ease_factor,
            interval=s.interval,
            repetitions=s.repetitions,
            next_review=s.next_review,
            last_reviewed=s.last_reviewed,
            content_preview=note_previews.get(s.item_id, ""),
        ))

    return items


@router.get("/stats", response_model=ReviewStatsResponse)
async def get_review_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return review queue statistics."""
    now = datetime.now(timezone.utc)
    today_start = datetime(
        now.year, now.month, now.day, tzinfo=timezone.utc
    )

    # total_scheduled
    result = await db.execute(
        select(sa_func.count(ReviewSchedule.id)).where(
            ReviewSchedule.user_id == current_user.id,
        )
    )
    total_scheduled = result.scalar() or 0

    # due_now
    result = await db.execute(
        select(sa_func.count(ReviewSchedule.id)).where(
            ReviewSchedule.user_id == current_user.id,
            ReviewSchedule.next_review <= now,
        )
    )
    due_now = result.scalar() or 0

    # reviewed_today
    result = await db.execute(
        select(sa_func.count(ReviewSchedule.id)).where(
            ReviewSchedule.user_id == current_user.id,
            ReviewSchedule.last_reviewed >= today_start,
        )
    )
    reviewed_today = result.scalar() or 0

    # mastered (interval >= 21)
    result = await db.execute(
        select(sa_func.count(ReviewSchedule.id)).where(
            ReviewSchedule.user_id == current_user.id,
            ReviewSchedule.interval >= 21,
        )
    )
    mastered = result.scalar() or 0

    return ReviewStatsResponse(
        total_scheduled=total_scheduled,
        due_now=due_now,
        reviewed_today=reviewed_today,
        mastered=mastered,
    )


@router.post("/{review_id}/complete", response_model=DueReviewItem)
async def complete_review(
    review_id: int,
    body: CompleteReviewRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a review as complete with SM-2 quality rating."""
    result = await db.execute(
        select(ReviewSchedule).where(
            ReviewSchedule.id == review_id,
            ReviewSchedule.user_id == current_user.id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Review schedule not found")

    from app.reviews.service import compute_srs

    new_ease, new_interval, new_reps = compute_srs(
        schedule.ease_factor, schedule.interval, schedule.repetitions, body.quality
    )
    now = datetime.now(timezone.utc)
    schedule.ease_factor = new_ease
    schedule.interval = new_interval
    schedule.repetitions = new_reps
    schedule.next_review = now + timedelta(days=new_interval)
    schedule.last_reviewed = now

    await db.commit()
    await db.refresh(schedule)

    # Invalidate dashboard cache
    await cache_delete_pattern(f"dashboard:*:{current_user.id}")

    # Fire automation event
    background_tasks.add_task(fire_event, current_user.id, "note_reviewed", {
        "review_id": schedule.id,
        "item_type": schedule.item_type,
        "item_id": schedule.item_id,
        "quality": body.quality,
        "interval": new_interval,
    })

    return schedule


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a note from the review queue."""
    result = await db.execute(
        select(ReviewSchedule).where(
            ReviewSchedule.id == review_id,
            ReviewSchedule.user_id == current_user.id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Review schedule not found")

    await db.delete(schedule)
    await db.commit()
