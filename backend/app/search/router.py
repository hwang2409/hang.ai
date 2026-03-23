import json
from itertools import combinations
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document, DocumentLink
from app.notes.schemas import TagResponse
from app.search.models import NoteEmbedding
from app.search.schemas import HybridSearchRequest, HybridSearchResponse, SearchResultItem
from app.search.service import hybrid_search, cosine_similarity

router = APIRouter()


@router.post("/hybrid", response_model=HybridSearchResponse)
async def search_hybrid(
    body: HybridSearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = await hybrid_search(db, current_user.id, body.query, body.limit)

    items = []
    for score, doc, match_type in results:
        items.append(SearchResultItem(
            id=doc.id,
            title=doc.title or "Untitled",
            preview=(doc.content or "")[:120] if doc.type != "canvas" else "",
            type=doc.type,
            source="note",
            tags=[TagResponse.model_validate(t).model_dump() for t in doc.tags],
            match_type=match_type,
            score=round(score, 4),
            updated_at=doc.updated_at,
        ))

    # Also search flashcards
    from app.search.service import keyword_search_flashcards
    fc_results = await keyword_search_flashcards(db, current_user.id, body.query)
    for score, card in fc_results:
        items.append(SearchResultItem(
            id=card.id,
            title=card.front[:80] if card.front else "Flashcard",
            preview=card.back[:120] if card.back else "",
            type="flashcard",
            source="flashcard",
            tags=[],
            match_type="keyword",
            score=round(score, 4),
            updated_at=card.updated_at,
        ))

    # Sort all items by score descending
    items.sort(key=lambda x: x.score, reverse=True)
    items = items[:body.limit]

    return HybridSearchResponse(results=items, query=body.query)


class KnowledgeGraphNode(BaseModel):
    id: int
    title: str
    folder_id: Optional[int]


class KnowledgeGraphEdge(BaseModel):
    source: int
    target: int
    weight: float


class KnowledgeGraphResponse(BaseModel):
    nodes: list[KnowledgeGraphNode]
    edges: list[KnowledgeGraphEdge]


@router.get("/knowledge-graph", response_model=KnowledgeGraphResponse)
async def knowledge_graph(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(NoteEmbedding, Document).join(
            Document, NoteEmbedding.document_id == Document.id
        ).where(
            Document.user_id == current_user.id,
            Document.deleted == False,  # noqa: E712
        )
    )
    rows = result.all()

    # Parse all embeddings once
    parsed: list[tuple[Document, list[float]]] = []
    for emb, doc in rows:
        try:
            vec = json.loads(emb.embedding)
        except (json.JSONDecodeError, TypeError):
            continue
        parsed.append((doc, vec))

    nodes = [
        KnowledgeGraphNode(id=doc.id, title=doc.title or "Untitled", folder_id=doc.folder_id)
        for doc, _ in parsed
    ]

    edges = []
    for (doc_a, vec_a), (doc_b, vec_b) in combinations(parsed, 2):
        weight = cosine_similarity(vec_a, vec_b)
        if weight > 0.4:
            edges.append(KnowledgeGraphEdge(
                source=doc_a.id,
                target=doc_b.id,
                weight=round(weight, 4),
            ))

    # Add explicit user-created links as strong edges
    existing_pairs = {(e.source, e.target) for e in edges} | {(e.target, e.source) for e in edges}
    node_ids = {n.id for n in nodes}

    link_result = await db.execute(
        select(DocumentLink).where(DocumentLink.user_id == current_user.id)
    )
    for link in link_result.scalars().all():
        if link.source_id in node_ids and link.target_id in node_ids:
            if (link.source_id, link.target_id) not in existing_pairs:
                edges.append(KnowledgeGraphEdge(
                    source=link.source_id,
                    target=link.target_id,
                    weight=1.0,
                ))
                existing_pairs.add((link.source_id, link.target_id))
                existing_pairs.add((link.target_id, link.source_id))

    return KnowledgeGraphResponse(nodes=nodes, edges=edges)
