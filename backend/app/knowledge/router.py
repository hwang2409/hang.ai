import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt_api_key
from app.deps import get_db, get_current_user
from app.auth.models import User
from app.knowledge.models import UserConcept, ConceptSource
from app.knowledge.service import (
    check_readiness,
    compute_concept_mastery,
    sync_concepts_from_analysis,
)
from app.notes.models import Document, DocumentLink, NoteAnalysis

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


@router.get("/gaps")
async def knowledge_gaps(
    limit: int = 8,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return notes with incomplete prerequisite coverage for dashboard widget."""
    result = await db.execute(
        select(NoteAnalysis, Document.id.label("doc_id"), Document.title)
        .join(Document, NoteAnalysis.document_id == Document.id)
        .where(Document.user_id == current_user.id, Document.deleted == False)
    )
    rows = result.all()

    # Get user's known concepts — only those taught in a non-deleted document
    uc_result = await db.execute(
        select(UserConcept.normalized)
        .where(UserConcept.user_id == current_user.id)
        .where(
            UserConcept.id.in_(
                select(ConceptSource.concept_id)
                .join(Document, Document.id == ConceptSource.document_id)
                .where(
                    ConceptSource.source_type == "concept",
                    Document.deleted == False,
                )
            )
        )
    )
    known_norms = {row.normalized for row in uc_result.all()}

    from app.knowledge.service import normalize_concept

    gaps = []
    for analysis, doc_id, title in rows:
        try:
            data = json.loads(analysis.analysis_json)
        except Exception:
            continue
        prerequisites = data.get("prerequisites", [])
        if not prerequisites:
            continue

        valid_prereqs = [p for p in prerequisites if isinstance(p, str) and p.strip()]
        if not valid_prereqs:
            continue

        missing = []
        known_count = 0
        for prereq in valid_prereqs:
            norm = normalize_concept(prereq)
            if norm in known_norms:
                known_count += 1
            else:
                missing.append(prereq)

        total = len(valid_prereqs)
        coverage_pct = round(known_count / total * 100, 1) if total else 100

        if coverage_pct < 100:
            gaps.append({
                "note_id": doc_id,
                "note_title": title,
                "total": total,
                "known": known_count,
                "coverage_pct": coverage_pct,
                "missing": missing,
            })

    gaps.sort(key=lambda g: g["coverage_pct"])
    return {"gaps": gaps[:limit]}


class GeneratePrereqRequest(BaseModel):
    concept: str
    source_note_id: int


@router.post("/generate-prerequisite")
async def generate_prerequisite_note(
    body: GeneratePrereqRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a new study note for a prerequisite concept using LLM."""
    concept = body.concept.strip()
    if not concept:
        raise HTTPException(status_code=400, detail="Concept name is required")

    # Verify source note ownership
    result = await db.execute(
        select(Document).where(
            Document.id == body.source_note_id,
            Document.user_id == current_user.id,
            Document.deleted == False,
        )
    )
    source_doc = result.scalar_one_or_none()
    if not source_doc:
        raise HTTPException(status_code=404, detail="Source document not found")

    # Resolve API key
    api_key = None
    if current_user.encrypted_anthropic_key:
        try:
            api_key = decrypt_api_key(current_user.encrypted_anthropic_key)
        except Exception:
            pass

    from app.llm.service import evaluate_text, ApiKeyRequiredError

    source_context = (source_doc.content or "")[:2000]
    prompt = (
        f"Write a focused study note about: {concept}\n\n"
        f"Context: This concept is a prerequisite for understanding the note titled "
        f'"{source_doc.title or "Untitled"}", which covers:\n'
        f"{source_context}\n\n"
        "Requirements:\n"
        "- Write in markdown format\n"
        "- ~400-600 words, focused and practical\n"
        "- Start with a clear definition/explanation\n"
        "- Include key principles, formulas, or rules as applicable\n"
        "- Add 2-3 concrete examples\n"
        "- End with a brief summary of why this concept matters\n"
        "- Write at an introductory level — assume the reader is encountering this for the first time\n\n"
        "Start directly with the content, no preamble or title header."
    )

    try:
        content = await evaluate_text(prompt, api_key=api_key)
    except ApiKeyRequiredError:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate prerequisite note")

    # Create the document
    doc = Document(
        title=concept,
        content=content,
        type="text",
        user_id=current_user.id,
        folder_id=source_doc.folder_id,
    )
    db.add(doc)
    await db.flush()

    # Link the generated note to the source note
    db.add(DocumentLink(
        source_id=body.source_note_id,
        target_id=doc.id,
        user_id=current_user.id,
    ))
    await db.commit()
    await db.refresh(doc)

    # Trigger analysis in background (will sync concepts so this note becomes discoverable)
    from app.notes.insights import analyze_document_background
    background_tasks.add_task(
        analyze_document_background, doc.id, content, concept, api_key
    )

    return {"note_id": doc.id, "note_title": doc.title}


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
