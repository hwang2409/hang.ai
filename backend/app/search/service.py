import asyncio
import hashlib
import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.notes.models import Document
from app.search.models import NoteEmbedding

_executor = ThreadPoolExecutor(max_workers=1)
_model = None


def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding("BAAI/bge-small-en-v1.5")
    return _model


def _embed_sync(text: str) -> list[float]:
    model = _get_model()
    embeddings = list(model.embed([text]))
    return embeddings[0].tolist()


async def embed_text(text: str) -> list[float]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _embed_sync, text)


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def embed_document(db: AsyncSession, doc: Document) -> None:
    if doc.type in ("canvas", "moodboard"):
        return
    text = f"{doc.title}\n{doc.content}"[:2000]
    h = _content_hash(text)

    result = await db.execute(
        select(NoteEmbedding).where(NoteEmbedding.document_id == doc.id)
    )
    existing = result.scalar_one_or_none()

    if existing and existing.content_hash == h:
        return  # already up to date

    vec = await embed_text(text)
    vec_json = json.dumps(vec)

    if existing:
        existing.embedding = vec_json
        existing.content_hash = h
    else:
        db.add(NoteEmbedding(
            document_id=doc.id,
            embedding=vec_json,
            content_hash=h,
        ))
    await db.commit()


async def embed_document_background(doc_id: int) -> None:
    async with async_session() as db:
        result = await db.execute(
            select(Document).where(Document.id == doc_id)
        )
        doc = result.scalar_one_or_none()
        if doc:
            await embed_document(db, doc)


async def backfill_embeddings() -> None:
    async with async_session() as db:
        result = await db.execute(
            select(Document).where(
                Document.deleted == False,  # noqa: E712
                ~Document.id.in_(select(NoteEmbedding.document_id))
            )
        )
        docs = result.scalars().all()
        for doc in docs:
            try:
                await embed_document(db, doc)
            except Exception as e:
                print(f"Failed to embed doc {doc.id}: {e}")


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def keyword_search(
    db: AsyncSession, user_id: int, query: str
) -> dict[int, tuple[float, Document]]:
    pattern = f"%{query}%"
    result = await db.execute(
        select(Document).where(
            Document.user_id == user_id,
            Document.deleted == False,  # noqa: E712
            or_(
                Document.title.ilike(pattern),
                Document.content.ilike(pattern),
            ),
        )
    )
    docs = result.scalars().all()
    scores: dict[int, tuple[float, Document]] = {}

    query_lower = query.lower()
    for doc in docs:
        title_lower = (doc.title or "").lower()
        content_lower = (doc.content or "").lower()

        if title_lower == query_lower:
            score = 1.0
        elif query_lower in title_lower:
            score = 0.85
        else:
            count = content_lower.count(query_lower)
            score = min(0.6 + 0.05 * count, 0.75) if count > 0 else 0.0

        if score > 0:
            scores[doc.id] = (score, doc)

    return scores


async def keyword_search_flashcards(
    db: AsyncSession, user_id: int, query: str
) -> list[tuple[float, object]]:
    """Search flashcards by keyword matching on front/back text."""
    from app.flashcards.models import Flashcard

    pattern = f"%{query}%"
    result = await db.execute(
        select(Flashcard).where(
            Flashcard.user_id == user_id,
            or_(
                Flashcard.front.ilike(pattern),
                Flashcard.back.ilike(pattern),
            ),
        )
    )
    cards = result.scalars().all()
    scores: list[tuple[float, Flashcard]] = []

    query_lower = query.lower()
    for card in cards:
        front_lower = (card.front or "").lower()
        back_lower = (card.back or "").lower()

        if query_lower in front_lower:
            score = 0.8
        elif query_lower in back_lower:
            score = 0.6
        else:
            score = 0.4

        scores.append((score, card))

    return scores


async def semantic_search(
    db: AsyncSession, user_id: int, query: str
) -> dict[int, tuple[float, Document]]:
    query_vec = await embed_text(query)

    # Get all embeddings for user's documents
    result = await db.execute(
        select(NoteEmbedding, Document).join(
            Document, NoteEmbedding.document_id == Document.id
        ).where(
            Document.user_id == user_id,
            Document.deleted == False,  # noqa: E712
        )
    )
    rows = result.all()
    scores: dict[int, tuple[float, Document]] = {}

    for emb, doc in rows:
        doc_vec = json.loads(emb.embedding)
        sim = cosine_similarity(query_vec, doc_vec)
        if sim > 0.3:
            scores[doc.id] = (sim, doc)

    return scores


async def hybrid_search(
    db: AsyncSession, user_id: int, query: str, limit: int = 20
) -> list[tuple[float, Document, str]]:
    kw_results, sem_results = await asyncio.gather(
        keyword_search(db, user_id, query),
        semantic_search(db, user_id, query),
    )

    all_doc_ids = set(kw_results.keys()) | set(sem_results.keys())
    merged: list[tuple[float, Document, str]] = []
    now = datetime.now(timezone.utc)

    for doc_id in all_doc_ids:
        kw_score = kw_results[doc_id][0] if doc_id in kw_results else 0.0
        sem_score = sem_results[doc_id][0] if doc_id in sem_results else 0.0
        doc = kw_results.get(doc_id, sem_results.get(doc_id))[1]

        # Determine match type
        if doc_id in kw_results and doc_id in sem_results:
            match_type = "both"
        elif doc_id in kw_results:
            match_type = "keyword"
        else:
            match_type = "semantic"

        # Recency boost
        updated = doc.updated_at.replace(tzinfo=timezone.utc) if doc.updated_at.tzinfo is None else doc.updated_at
        days_old = max((now - updated).total_seconds() / 86400, 0)
        recency = 0.05 * math.exp(-days_old / 30)

        final_score = 0.55 * kw_score + 0.45 * sem_score + recency
        merged.append((final_score, doc, match_type))

    merged.sort(key=lambda x: (-x[0], x[1].updated_at), reverse=False)
    merged.sort(key=lambda x: x[0], reverse=True)
    return merged[:limit]
