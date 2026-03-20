from datetime import date, datetime, timedelta, timezone

from icalendar import Calendar, Event
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.flashcards.models import Flashcard
from app.todos.models import TodoItem
from app.studyplan.models import StudyPlan, StudyPlanItem


async def generate_ical_feed(user_id: int, db: AsyncSession) -> str:
    cal = Calendar()
    cal.add("prodid", "-//Neuronic//Study Calendar//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("x-wr-calname", "Neuronic Study Schedule")

    now = datetime.now(timezone.utc)
    today = date.today()
    week_end = today + timedelta(days=7)

    # 1. Flashcards due — group by day for the next 7 days
    for day_offset in range(7):
        check_date = today + timedelta(days=day_offset)
        day_start = datetime(check_date.year, check_date.month, check_date.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)

        result = await db.execute(
            select(sa_func.count(Flashcard.id)).where(
                Flashcard.user_id == user_id,
                Flashcard.next_review >= day_start,
                Flashcard.next_review < day_end,
            )
        )
        count = result.scalar() or 0
        if count == 0:
            continue

        event = Event()
        event.add("summary", f"Review {count} flashcard{'s' if count != 1 else ''}")
        event.add("dtstart", check_date)
        event.add("dtend", check_date)
        event.add("description", f"{count} flashcard{'s' if count != 1 else ''} due for review on Neuronic")
        event["uid"] = f"flashcard-due-{check_date.isoformat()}@neuronic"
        cal.add_component(event)

    # Also add overdue flashcards as a single event for today
    result = await db.execute(
        select(sa_func.count(Flashcard.id)).where(
            Flashcard.user_id == user_id,
            Flashcard.next_review <= now,
        )
    )
    overdue_count = result.scalar() or 0
    if overdue_count > 0:
        event = Event()
        event.add("summary", f"Overdue: {overdue_count} flashcard{'s' if overdue_count != 1 else ''}")
        event.add("dtstart", today)
        event.add("dtend", today)
        event.add("description", f"{overdue_count} flashcard{'s' if overdue_count != 1 else ''} are overdue for review")
        event["uid"] = f"flashcard-overdue-{today.isoformat()}@neuronic"
        cal.add_component(event)

    # 2. Todos with due dates
    result = await db.execute(
        select(TodoItem).where(
            TodoItem.user_id == user_id,
            TodoItem.completed == False,
            TodoItem.due_date.isnot(None),
            TodoItem.due_date >= today - timedelta(days=7),
            TodoItem.due_date <= week_end + timedelta(days=30),
        )
    )
    todos = result.scalars().all()
    for todo in todos:
        event = Event()
        prefix = "OVERDUE: " if todo.due_date < today else ""
        event.add("summary", f"{prefix}{todo.text}")
        event.add("dtstart", todo.due_date)
        event.add("dtend", todo.due_date)
        event["uid"] = f"todo-{todo.id}-{todo.due_date.isoformat()}@neuronic"
        cal.add_component(event)

    # 3. Study plan items
    try:
        result = await db.execute(
            select(StudyPlanItem, StudyPlan.title)
            .join(StudyPlan, StudyPlanItem.plan_id == StudyPlan.id)
            .where(
                StudyPlan.user_id == user_id,
                StudyPlan.status == "active",
                StudyPlanItem.date >= today - timedelta(days=1),
                StudyPlanItem.date <= week_end + timedelta(days=30),
            )
        )
        rows = result.all()
        for item, plan_title in rows:
            event = Event()
            status = " [done]" if item.completed else ""
            event.add("summary", f"Study: {item.topic}{status}")
            event.add("dtstart", item.date)
            event.add("dtend", item.date)
            if item.description:
                event.add("description", item.description)
            event["uid"] = f"studyplan-{item.id}-{item.date.isoformat()}@neuronic"
            cal.add_component(event)
    except Exception:
        pass

    return cal.to_ical().decode("utf-8")
