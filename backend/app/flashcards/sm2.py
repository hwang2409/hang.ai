from datetime import datetime, timedelta, timezone

from app.flashcards.models import Flashcard


def apply_sm2(card: Flashcard, quality: int) -> None:
    """Apply SM-2 spaced repetition algorithm to update card scheduling."""
    if quality >= 3:
        if card.repetitions == 0:
            card.interval = 1
        elif card.repetitions == 1:
            card.interval = 6
        else:
            card.interval = round(card.interval * card.ease_factor)
        card.repetitions += 1
    else:
        card.repetitions = 0
        card.interval = 1

    card.ease_factor = max(
        1.3,
        card.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
    )
    card.next_review = datetime.now(timezone.utc) + timedelta(days=card.interval)
    card.last_reviewed = datetime.now(timezone.utc)
