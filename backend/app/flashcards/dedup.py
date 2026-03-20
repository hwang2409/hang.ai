import unicodedata
import re
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.flashcards.models import Flashcard
from app.llm.service import evaluate_text
from app.llm.response_parser import parse_llm_json


def normalize_front(text: str) -> str:
    """Normalize front text for exact-match comparison."""
    text = unicodedata.normalize("NFC", text)
    text = text.lower()
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"[?.!]+$", "", text).strip()
    return text


async def _fetch_user_cards(
    db: AsyncSession, user_id: int
) -> list[Flashcard]:
    result = await db.execute(
        select(Flashcard).where(Flashcard.user_id == user_id)
    )
    return list(result.scalars().all())


async def find_exact_duplicate(
    db: AsyncSession, user_id: int, front: str
) -> Optional[Flashcard]:
    """Return the existing card if front text is an exact normalized match."""
    normalized = normalize_front(front)
    cards = await _fetch_user_cards(db, user_id)
    for card in cards:
        if normalize_front(card.front) == normalized:
            return card
    return None


async def find_exact_duplicates_batch(
    db: AsyncSession, user_id: int, fronts: list[str]
) -> dict[str, Flashcard]:
    """Return {original_front: existing_card} for any exact normalized matches."""
    cards = await _fetch_user_cards(db, user_id)
    existing_normalized = {normalize_front(c.front): c for c in cards}
    dupes: dict[str, Flashcard] = {}
    for front in fronts:
        norm = normalize_front(front)
        if norm in existing_normalized:
            dupes[front] = existing_normalized[norm]
    return dupes


async def find_semantic_duplicates(
    new_cards: list[dict], existing_fronts: list[str]
) -> list[int]:
    """Use LLM to find semantically duplicate questions.

    Returns indices (into new_cards) that are duplicates of existing cards.
    Gracefully returns empty list on any failure.
    """
    if not new_cards or not existing_fronts:
        return []

    numbered_new = "\n".join(
        f"{i}: {c['front']}" for i, c in enumerate(new_cards)
    )
    existing_list = "\n".join(f"- {f}" for f in existing_fronts)

    prompt = (
        "Compare these NEW flashcard questions against EXISTING ones. "
        "Identify which new ones are semantically equivalent to an existing one "
        "(same concept asked differently).\n\n"
        f"NEW (numbered):\n{numbered_new}\n\n"
        f"EXISTING:\n{existing_list}\n\n"
        "Return ONLY a JSON array of the indices (integers) of NEW cards that are "
        "duplicates. If none are duplicates, return []. No explanation."
    )

    try:
        raw = await evaluate_text(prompt)
        indices = parse_llm_json(raw)
        if not isinstance(indices, list):
            return []
        return [i for i in indices if isinstance(i, int) and 0 <= i < len(new_cards)]
    except Exception:
        return []
