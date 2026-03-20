import json
import os
import tempfile
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from starlette.responses import FileResponse
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document
from app.flashcards.models import Flashcard, FlashcardReview
from app.flashcards.schemas import (
    DuplicateInfo,
    FlashcardCreate,
    FlashcardResponse,
    FlashcardUpdate,
    GenerateRequest,
    GenerateResponse,
    ReviewRequest,
    ReviewResponse,
    StatsResponse,
    WeakSpotCard,
    WeakSpotGroup,
    WeakSpotsResponse,
)
from app.cache import cache_delete_pattern
from app.flashcards.dedup import (
    find_exact_duplicate,
    find_exact_duplicates_batch,
    find_semantic_duplicates,
    normalize_front,
)
from app.flashcards.sm2 import apply_sm2
from app.llm.service import evaluate_text
from app.llm.response_parser import parse_llm_json
from app.rate_limit import limiter

router = APIRouter()


@router.get("", response_model=list[FlashcardResponse])
async def list_flashcards(
    note_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Flashcard).where(Flashcard.user_id == current_user.id)
    if note_id is not None:
        stmt = stmt.where(Flashcard.note_id == note_id)
    stmt = stmt.order_by(Flashcard.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=FlashcardResponse, status_code=status.HTTP_201_CREATED)
async def create_flashcard(
    body: FlashcardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = await find_exact_duplicate(db, current_user.id, body.front)
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A flashcard with a similar question already exists",
        )

    card = Flashcard(
        front=body.front,
        back=body.back,
        user_id=current_user.id,
        note_id=body.note_id,
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return card


@router.get("/due", response_model=list[FlashcardResponse])
async def get_due_flashcards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Flashcard)
        .where(
            Flashcard.user_id == current_user.id,
            Flashcard.next_review <= now,
        )
        .order_by(Flashcard.next_review)
    )
    return result.scalars().all()


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)

    # Total
    result = await db.execute(
        select(sa_func.count(Flashcard.id)).where(Flashcard.user_id == current_user.id)
    )
    total = result.scalar() or 0

    # Due today
    result = await db.execute(
        select(sa_func.count(Flashcard.id)).where(
            Flashcard.user_id == current_user.id,
            Flashcard.next_review <= now,
        )
    )
    due_today = result.scalar() or 0

    # Mastered (interval >= 21 days)
    result = await db.execute(
        select(sa_func.count(Flashcard.id)).where(
            Flashcard.user_id == current_user.id,
            Flashcard.interval >= 21,
        )
    )
    mastered = result.scalar() or 0

    learning = total - mastered

    return StatsResponse(
        total=total,
        due_today=due_today,
        mastered=mastered,
        learning=learning,
    )


@router.get("/weak-spots", response_model=WeakSpotsResponse)
async def get_weak_spots(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import or_, and_

    # Cards with low ease_factor OR reset (repetitions==0 but previously reviewed)
    stmt = select(Flashcard).where(
        Flashcard.user_id == current_user.id,
        or_(
            Flashcard.ease_factor < 1.8,
            and_(
                Flashcard.repetitions == 0,
                Flashcard.last_reviewed.isnot(None),
            ),
        ),
    )
    result = await db.execute(stmt)
    weak_cards = list(result.scalars().all())

    if not weak_cards:
        return WeakSpotsResponse(groups=[], total=0)

    # Group by note_id
    groups_map: dict[int | None, list[Flashcard]] = {}
    for card in weak_cards:
        groups_map.setdefault(card.note_id, []).append(card)

    # Fetch note titles for linked cards
    note_ids = [nid for nid in groups_map if nid is not None]
    note_titles: dict[int, str] = {}
    if note_ids:
        notes_result = await db.execute(
            select(Document.id, Document.title).where(Document.id.in_(note_ids))
        )
        for row in notes_result:
            note_titles[row[0]] = row[1] or "Untitled"

    # Build response groups, sorted by worst avg ease first
    groups = []
    for note_id, cards in groups_map.items():
        avg_ease = sum(c.ease_factor for c in cards) / len(cards)
        groups.append(WeakSpotGroup(
            note_id=note_id,
            note_title=note_titles.get(note_id, "Unlinked") if note_id else "Unlinked",
            cards=[WeakSpotCard.model_validate(c) for c in cards],
            avg_ease=round(avg_ease, 2),
        ))

    groups.sort(key=lambda g: g.avg_ease)

    return WeakSpotsResponse(groups=groups, total=len(weak_cards))


# ── Anki Export ────────────────────────────────────────────────────────────

_ANKI_MODEL_ID = 1607392319
_ANKI_DECK_BASE_ID = 2059400110


@router.get("/export/anki")
async def export_anki(
    background_tasks: BackgroundTasks,
    token: str = Query(...),
    note_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Export flashcards as an Anki .apkg file."""
    from jose import JWTError, jwt as jose_jwt
    from app.config import settings
    try:
        payload = jose_jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = int(payload.get("sub", 0))
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    import genanki
    import markdown as md

    stmt = select(Flashcard).where(Flashcard.user_id == user_id)
    if note_id is not None:
        stmt = stmt.where(Flashcard.note_id == note_id)
    stmt = stmt.order_by(Flashcard.created_at.desc())
    result = await db.execute(stmt)
    cards = list(result.scalars().all())

    if not cards:
        raise HTTPException(status_code=404, detail="No flashcards to export")

    # Determine deck name
    deck_name = "Neuronic Flashcards"
    deck_id = _ANKI_DECK_BASE_ID + user_id
    if note_id is not None:
        note_result = await db.execute(
            select(Document).where(Document.id == note_id, Document.user_id == user_id)
        )
        note = note_result.scalar_one_or_none()
        if note and note.title:
            deck_name = f"Neuronic — {note.title}"
        deck_id = _ANKI_DECK_BASE_ID + note_id

    model = genanki.Model(
        _ANKI_MODEL_ID,
        "Neuronic Flashcard",
        fields=[{"name": "Front"}, {"name": "Back"}],
        templates=[{
            "name": "Card 1",
            "qfmt": "{{Front}}",
            "afmt": "{{FrontSide}}<hr id=answer>{{Back}}",
        }],
    )

    deck = genanki.Deck(deck_id, deck_name)

    for card in cards:
        front_html = md.markdown(card.front or "", extensions=["tables", "fenced_code"])
        back_html = md.markdown(card.back or "", extensions=["tables", "fenced_code"])
        note = genanki.Note(model=model, fields=[front_html, back_html])
        deck.add_note(note)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".apkg")
    tmp.close()
    try:
        genanki.Package(deck).write_to_file(tmp.name)
    except Exception:
        os.unlink(tmp.name)
        raise HTTPException(status_code=500, detail="Anki export failed")

    safe_name = deck_name.replace(" ", "_").replace("—", "-")[:60]
    filename = f"{safe_name}.apkg"

    background_tasks.add_task(os.unlink, tmp.name)
    return FileResponse(
        tmp.name,
        media_type="application/octet-stream",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.put("/{card_id}", response_model=FlashcardResponse)
async def update_flashcard(
    card_id: int,
    body: FlashcardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Flashcard).where(
            Flashcard.id == card_id,
            Flashcard.user_id == current_user.id,
        )
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    if body.front is not None:
        card.front = body.front
    if body.back is not None:
        card.back = body.back

    await db.commit()
    await db.refresh(card)
    return card


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flashcard(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Flashcard).where(
            Flashcard.id == card_id,
            Flashcard.user_id == current_user.id,
        )
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    await db.delete(card)
    await db.commit()


@router.post("/{card_id}/review", response_model=ReviewResponse)
async def review_flashcard(
    card_id: int,
    body: ReviewRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Flashcard).where(
            Flashcard.id == card_id,
            Flashcard.user_id == current_user.id,
        )
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    apply_sm2(card, body.quality)
    db.add(FlashcardReview(card_id=card_id, user_id=current_user.id, quality=body.quality))
    await db.commit()
    await db.refresh(card)
    await cache_delete_pattern(f"dashboard:*:{current_user.id}")

    # Fire webhook + gcal sync for flashcard due counts
    _uid = current_user.id
    async def _check_and_fire():
        from datetime import date, timedelta
        from app.database import async_session
        from app.integrations.webhook import fire_webhooks_for_user
        from app.integrations.google_calendar import sync_flashcard_batch_to_gcal
        async with async_session() as s:
            now = datetime.now(timezone.utc)
            due_result = await s.execute(
                select(sa_func.count(Flashcard.id)).where(
                    Flashcard.user_id == _uid,
                    Flashcard.next_review <= now,
                )
            )
            due_count = due_result.scalar() or 0
            if due_count > 0:
                await fire_webhooks_for_user(
                    _uid, "flashcard_due",
                    {"count": due_count}, s,
                )

            # Sync flashcard batch counts to Google Calendar for next 7 days
            today = date.today()
            for day_offset in range(7):
                check_date = today + timedelta(days=day_offset)
                day_start = datetime(check_date.year, check_date.month, check_date.day, tzinfo=timezone.utc)
                day_end = day_start + timedelta(days=1)
                count_result = await s.execute(
                    select(sa_func.count(Flashcard.id)).where(
                        Flashcard.user_id == _uid,
                        Flashcard.next_review >= day_start,
                        Flashcard.next_review < day_end,
                    )
                )
                count = count_result.scalar() or 0
                await sync_flashcard_batch_to_gcal(_uid, check_date, count, s)

    background_tasks.add_task(_check_and_fire)

    return card


@limiter.limit("15/minute")
@router.post("/generate", response_model=GenerateResponse)
async def generate_flashcards(
    request: Request,
    body: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Fetch the note
    result = await db.execute(
        select(Document).where(
            Document.id == body.note_id,
            Document.user_id == current_user.id,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Fetch existing card fronts for prompt augmentation
    existing_result = await db.execute(
        select(Flashcard).where(Flashcard.user_id == current_user.id)
    )
    existing_cards = list(existing_result.scalars().all())
    existing_fronts = [c.front for c in existing_cards]

    study_content = body.content_override if body.content_override else note.content
    prompt = (
        f"Generate exactly {body.count} flashcards from the following study material. "
        "Return ONLY a JSON array of objects with \"front\" and \"back\" keys. "
        "No markdown, no explanation.\n\n"
        f"Study material:\n{study_content}"
    )

    # Prompt augmentation: tell LLM about existing cards
    if existing_fronts:
        existing_list = "\n".join(f"- {f}" for f in existing_fronts)
        prompt += (
            "\n\nIMPORTANT: Do NOT generate questions that overlap with these "
            f"existing flashcards:\n{existing_list}"
        )

    raw_response = await evaluate_text(prompt)

    try:
        cards_data = parse_llm_json(raw_response)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Failed to parse flashcards from AI response",
        )

    if not isinstance(cards_data, list):
        raise HTTPException(
            status_code=500,
            detail="AI response was not a JSON array",
        )

    # Filter to valid items
    cards_data = [
        item for item in cards_data
        if isinstance(item, dict) and "front" in item and "back" in item
    ]

    skipped: list[DuplicateInfo] = []

    # Phase 1: Remove intra-batch exact dupes
    seen_normalized: set[str] = set()
    deduped_batch: list[dict] = []
    for item in cards_data:
        norm = normalize_front(item["front"])
        if norm in seen_normalized:
            skipped.append(DuplicateInfo(front=item["front"], reason="exact_duplicate"))
        else:
            seen_normalized.add(norm)
            deduped_batch.append(item)

    # Phase 2: Remove exact matches against existing user cards
    if deduped_batch:
        exact_dupes = await find_exact_duplicates_batch(
            db, current_user.id, [c["front"] for c in deduped_batch]
        )
        surviving: list[dict] = []
        for item in deduped_batch:
            if item["front"] in exact_dupes:
                skipped.append(DuplicateInfo(front=item["front"], reason="exact_duplicate"))
            else:
                surviving.append(item)
        deduped_batch = surviving

    # Phase 3: Semantic dedup via LLM (only on surviving cards)
    if deduped_batch and existing_fronts:
        semantic_dup_indices = await find_semantic_duplicates(deduped_batch, existing_fronts)
        final: list[dict] = []
        for i, item in enumerate(deduped_batch):
            if i in semantic_dup_indices:
                skipped.append(DuplicateInfo(front=item["front"], reason="semantic_duplicate"))
            else:
                final.append(item)
        deduped_batch = final

    # Save surviving cards
    created_cards: list[Flashcard] = []
    for item in deduped_batch:
        card = Flashcard(
            front=item["front"],
            back=item["back"],
            user_id=current_user.id,
            note_id=body.note_id,
        )
        db.add(card)
        created_cards.append(card)

    await db.commit()
    for card in created_cards:
        await db.refresh(card)

    return GenerateResponse(
        flashcards=[FlashcardResponse.model_validate(c) for c in created_cards],
        skipped=skipped,
    )
