from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.reviews.models import ReviewSchedule


def compute_srs(
    ease_factor: float, interval: int, repetitions: int, quality: int
) -> tuple[float, int, int]:
    """Pure SM-2 computation. Returns (new_ease, new_interval, new_reps)."""
    if quality >= 3:
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval * ease_factor)
        new_reps = repetitions + 1
    else:
        new_reps = 0
        new_interval = 1

    new_ease = max(
        1.3,
        ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
    )
    return new_ease, new_interval, new_reps


async def ensure_note_review_schedule(
    db: AsyncSession, user_id: int, doc_id: int, title: str
) -> ReviewSchedule:
    """Idempotent: create a ReviewSchedule row for a note if it doesn't exist."""
    result = await db.execute(
        select(ReviewSchedule).where(
            ReviewSchedule.user_id == user_id,
            ReviewSchedule.item_type == "note",
            ReviewSchedule.item_id == doc_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    now = datetime.now(timezone.utc)
    schedule = ReviewSchedule(
        user_id=user_id,
        item_type="note",
        item_id=doc_id,
        item_label=title or "Untitled",
        next_review=now + timedelta(days=1),
    )
    db.add(schedule)
    return schedule


async def update_review_from_activity(
    db: AsyncSession, user_id: int, doc_id: int, quality: int
) -> None:
    """Update an existing note's review schedule based on external activity (e.g. quiz score)."""
    result = await db.execute(
        select(ReviewSchedule).where(
            ReviewSchedule.user_id == user_id,
            ReviewSchedule.item_type == "note",
            ReviewSchedule.item_id == doc_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        return

    new_ease, new_interval, new_reps = compute_srs(
        schedule.ease_factor, schedule.interval, schedule.repetitions, quality
    )
    now = datetime.now(timezone.utc)
    schedule.ease_factor = new_ease
    schedule.interval = new_interval
    schedule.repetitions = new_reps
    schedule.next_review = now + timedelta(days=new_interval)
    schedule.last_reviewed = now
