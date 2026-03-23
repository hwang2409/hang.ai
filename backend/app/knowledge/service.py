import json
import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.knowledge.models import UserConcept, ConceptSource
from app.notes.models import Document, NoteAnalysis
from app.flashcards.models import Flashcard
from app.quizzes.models import Quiz, QuizAttempt
from app.feynman.models import FeynmanSession

logger = logging.getLogger(__name__)

ARTICLES = {"the", "a", "an"}


def normalize_concept(text: str) -> str:
    """Lowercase, strip articles, collapse whitespace, basic plural handling."""
    t = text.lower().strip()
    words = t.split()
    words = [w for w in words if w not in ARTICLES]
    t = " ".join(words)
    t = re.sub(r"\s+", " ", t).strip()
    # Basic trailing-s plural normalization
    if t.endswith("s") and not t.endswith("ss"):
        t = t[:-1]
    return t


async def sync_concepts_from_analysis(
    db: AsyncSession, user_id: int, doc_id: int, analysis_json: dict,
):
    """Upsert concepts and sources from a note's analysis."""
    concepts = analysis_json.get("concepts", [])
    prerequisites = analysis_json.get("prerequisites", [])

    items = [(c, "concept") for c in concepts] + [(p, "prerequisite") for p in prerequisites]
    if not items:
        return

    for raw_text, source_type in items:
        if not isinstance(raw_text, str) or not raw_text.strip():
            continue
        norm = normalize_concept(raw_text)
        if not norm:
            continue

        # Upsert UserConcept
        result = await db.execute(
            select(UserConcept).where(
                UserConcept.user_id == user_id,
                UserConcept.normalized == norm,
            )
        )
        uc = result.scalar_one_or_none()
        if uc:
            uc.last_seen_at = datetime.now(timezone.utc)
        else:
            uc = UserConcept(
                user_id=user_id,
                concept=raw_text.strip(),
                normalized=norm,
            )
            db.add(uc)
            await db.flush()

        # Upsert ConceptSource
        result = await db.execute(
            select(ConceptSource).where(
                ConceptSource.concept_id == uc.id,
                ConceptSource.document_id == doc_id,
            )
        )
        if not result.scalar_one_or_none():
            db.add(ConceptSource(
                concept_id=uc.id,
                document_id=doc_id,
                source_type=source_type,
            ))

    await db.flush()


async def compute_note_mastery(db: AsyncSession, user_id: int, note_ids: list[int]) -> dict[int, float]:
    """Compute mastery % per note using flashcard ease, quiz avg, feynman score."""
    if not note_ids:
        return {}

    mastery: dict[int, float] = {}

    # Flashcard ease per note
    fc_result = await db.execute(
        select(
            Flashcard.note_id,
            sa_func.avg(Flashcard.ease_factor).label("avg_ease"),
        )
        .where(Flashcard.user_id == user_id, Flashcard.note_id.in_(note_ids))
        .group_by(Flashcard.note_id)
    )
    fc_data: dict[int, float] = {}
    for row in fc_result.all():
        if row.note_id is not None:
            fc_data[row.note_id] = float(row.avg_ease)

    # Quiz avg per note
    quiz_result = await db.execute(
        select(
            Quiz.note_id,
            sa_func.avg(QuizAttempt.score * 100.0 / QuizAttempt.total_questions).label("avg_pct"),
        )
        .join(QuizAttempt, Quiz.id == QuizAttempt.quiz_id)
        .where(Quiz.user_id == user_id, Quiz.note_id.in_(note_ids), QuizAttempt.total_questions > 0)
        .group_by(Quiz.note_id)
    )
    quiz_data: dict[int, float] = {}
    for row in quiz_result.all():
        if row.note_id is not None:
            quiz_data[row.note_id] = float(row.avg_pct)

    # Feynman best score per note
    feynman_result = await db.execute(
        select(
            FeynmanSession.note_id,
            sa_func.max(FeynmanSession.score).label("best_score"),
        )
        .where(FeynmanSession.user_id == user_id, FeynmanSession.note_id.in_(note_ids))
        .group_by(FeynmanSession.note_id)
    )
    feynman_data: dict[int, float] = {}
    for row in feynman_result.all():
        if row.note_id is not None and row.best_score is not None:
            feynman_data[row.note_id] = float(row.best_score)

    for nid in note_ids:
        scores = []
        if nid in fc_data:
            fc_pct = max(0, min(100, (fc_data[nid] - 1.3) / (2.5 - 1.3) * 100))
            scores.append(fc_pct)
        if nid in quiz_data:
            scores.append(quiz_data[nid])
        if nid in feynman_data:
            scores.append(feynman_data[nid])
        mastery[nid] = round(sum(scores) / len(scores), 1) if scores else 0

    return mastery


async def compute_concept_mastery(db: AsyncSession, user_id: int) -> dict[int, float]:
    """Per-concept mastery: average mastery of linked notes."""
    # Get all concept sources for user
    result = await db.execute(
        select(ConceptSource.concept_id, ConceptSource.document_id)
        .join(UserConcept, ConceptSource.concept_id == UserConcept.id)
        .where(UserConcept.user_id == user_id)
    )
    concept_notes: dict[int, list[int]] = {}
    all_note_ids: set[int] = set()
    for row in result.all():
        concept_notes.setdefault(row.concept_id, []).append(row.document_id)
        all_note_ids.add(row.document_id)

    if not all_note_ids:
        return {}

    note_mastery = await compute_note_mastery(db, user_id, list(all_note_ids))

    concept_mastery: dict[int, float] = {}
    for cid, nids in concept_notes.items():
        scores = [note_mastery.get(nid, 0) for nid in nids]
        concept_mastery[cid] = round(sum(scores) / len(scores), 1) if scores else 0

    return concept_mastery


async def check_readiness(db: AsyncSession, user_id: int, note_id: int) -> dict:
    """Match a note's prerequisites against user's known concepts."""
    # Get analysis for this note
    result = await db.execute(
        select(NoteAnalysis).where(NoteAnalysis.document_id == note_id)
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        return {"total": 0, "known": 0, "coverage_pct": 0, "prerequisites": []}

    data = json.loads(analysis.analysis_json)
    prerequisites = data.get("prerequisites", [])
    if not prerequisites:
        return {"total": 0, "known": 0, "coverage_pct": 100, "prerequisites": []}

    # Get user's known concepts
    result = await db.execute(
        select(UserConcept).where(UserConcept.user_id == user_id)
    )
    user_concepts = result.scalars().all()

    # Build lookup: normalized -> UserConcept
    norm_lookup: dict[str, UserConcept] = {}
    for uc in user_concepts:
        norm_lookup[uc.normalized] = uc

    # Compute concept mastery
    concept_mastery = await compute_concept_mastery(db, user_id)

    # Try exact match first, then embedding fallback
    prereq_results = []
    known_count = 0

    for prereq in prerequisites:
        if not isinstance(prereq, str) or not prereq.strip():
            continue
        norm_prereq = normalize_concept(prereq)
        matched = norm_lookup.get(norm_prereq)

        # If no exact match, try fuzzy matching via embeddings
        if not matched:
            matched = await _embedding_match(norm_prereq, user_concepts)

        if matched:
            known_count += 1
            prereq_results.append({
                "concept": prereq,
                "known": True,
                "mastery_pct": concept_mastery.get(matched.id, 0),
                "matched_concept": matched.concept,
            })
        else:
            prereq_results.append({
                "concept": prereq,
                "known": False,
                "mastery_pct": None,
                "matched_concept": None,
            })

    total = len(prereq_results)
    return {
        "total": total,
        "known": known_count,
        "coverage_pct": round(known_count / total * 100, 1) if total else 100,
        "prerequisites": prereq_results,
    }


async def _embedding_match(norm_prereq: str, user_concepts: list[UserConcept], threshold: float = 0.85):
    """Fallback: use embedding cosine similarity to find a matching concept."""
    try:
        from app.search.service import embed_text
        prereq_emb = await embed_text(norm_prereq)
        best_score = 0.0
        best_match = None
        for uc in user_concepts:
            uc_emb = await embed_text(uc.normalized)
            sim = _cosine_similarity(prereq_emb, uc_emb)
            if sim > best_score:
                best_score = sim
                best_match = uc
        if best_score >= threshold:
            return best_match
    except Exception:
        logger.debug("Embedding fallback failed", exc_info=True)
    return None


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = sum(x * x for x in a) ** 0.5
    mag_b = sum(x * x for x in b) ** 0.5
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)
