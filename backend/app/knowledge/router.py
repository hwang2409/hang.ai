import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.knowledge.models import UserConcept, ConceptSource
from app.knowledge.service import (
    check_readiness,
    compute_concept_mastery,
    sync_concepts_from_analysis,
)
from app.notes.models import Document, NoteAnalysis

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/concepts")
async def list_concepts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List user's known concepts with mastery scores."""
    result = await db.execute(
        select(
            UserConcept,
            sa_func.count(ConceptSource.id).label("note_count"),
        )
        .outerjoin(ConceptSource, ConceptSource.concept_id == UserConcept.id)
        .where(UserConcept.user_id == current_user.id)
        .group_by(UserConcept.id)
    )
    rows = result.all()

    concept_mastery = await compute_concept_mastery(db, current_user.id)

    concepts = []
    for uc, note_count in rows:
        concepts.append({
            "id": uc.id,
            "concept": uc.concept,
            "mastery_pct": concept_mastery.get(uc.id, 0),
            "note_count": note_count,
            "last_seen_at": uc.last_seen_at.isoformat() if uc.last_seen_at else None,
        })

    concepts.sort(key=lambda c: c["mastery_pct"], reverse=True)
    return {"concepts": concepts}


@router.get("/graph")
async def concept_graph(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return concept-level graph: nodes with mastery, edges by document co-occurrence."""
    # 1. Fetch all UserConcepts for user with note counts
    result = await db.execute(
        select(
            UserConcept,
            sa_func.count(ConceptSource.id).label("note_count"),
        )
        .outerjoin(ConceptSource, ConceptSource.concept_id == UserConcept.id)
        .where(UserConcept.user_id == current_user.id)
        .group_by(UserConcept.id)
    )
    rows = result.all()

    if not rows:
        return {"nodes": [], "edges": []}

    # 2. Compute mastery
    concept_mastery = await compute_concept_mastery(db, current_user.id)

    # Build nodes
    concept_ids = []
    note_count_map = {}
    nodes = []
    for uc, note_count in rows:
        concept_ids.append(uc.id)
        note_count_map[uc.id] = note_count
        nodes.append({
            "id": uc.id,
            "label": uc.concept,
            "mastery_pct": concept_mastery.get(uc.id, 0),
            "note_count": note_count,
        })

    # 3. Fetch all ConceptSources for those concepts
    result = await db.execute(
        select(ConceptSource.concept_id, ConceptSource.document_id)
        .where(ConceptSource.concept_id.in_(concept_ids))
    )
    source_rows = result.all()

    # 4. Build document -> concepts map, then invert to find co-occurring pairs
    doc_to_concepts: dict[int, set[int]] = {}
    for row in source_rows:
        doc_to_concepts.setdefault(row.document_id, set()).add(row.concept_id)

    # 5. Count shared documents per concept pair
    pair_shared: dict[tuple[int, int], int] = {}
    for doc_id, cids in doc_to_concepts.items():
        cid_list = sorted(cids)
        for i in range(len(cid_list)):
            for j in range(i + 1, len(cid_list)):
                pair = (cid_list[i], cid_list[j])
                pair_shared[pair] = pair_shared.get(pair, 0) + 1

    # 6. Build edges with weight = shared_doc_count / max(note_count_a, note_count_b)
    edges = []
    for (a, b), shared in pair_shared.items():
        max_count = max(note_count_map.get(a, 1), note_count_map.get(b, 1))
        weight = round(shared / max_count, 3) if max_count > 0 else 0
        if weight > 0:
            edges.append({
                "source": a,
                "target": b,
                "weight": weight,
                "shared_docs": shared,
            })

    return {"nodes": nodes, "edges": edges}


@router.get("/readiness/{note_id}")
async def get_readiness(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get prerequisite readiness for a note."""
    # Verify ownership
    result = await db.execute(
        select(Document).where(
            Document.id == note_id,
            Document.user_id == current_user.id,
            Document.deleted == False,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    return await check_readiness(db, current_user.id, note_id)


@router.post("/sync")
async def sync_all_concepts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-sync concepts from all analyzed notes."""
    result = await db.execute(
        select(NoteAnalysis, Document.id.label("doc_id"))
        .join(Document, NoteAnalysis.document_id == Document.id)
        .where(Document.user_id == current_user.id, Document.deleted == False)
    )
    rows = result.all()

    synced = 0
    for analysis, doc_id in rows:
        try:
            data = json.loads(analysis.analysis_json)
            await sync_concepts_from_analysis(db, current_user.id, doc_id, data)
            synced += 1
        except Exception:
            logger.debug("Failed to sync concepts for doc %d", doc_id, exc_info=True)

    await db.commit()
    return {"synced_notes": synced}
