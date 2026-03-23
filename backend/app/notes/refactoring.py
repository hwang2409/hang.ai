import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt_api_key
from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document, DocumentLink
from app.notes.schemas import DocumentResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/merge", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def merge_notes(
    body: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Merge multiple notes into a single document."""
    note_ids = body.get("note_ids", [])
    if len(note_ids) < 2:
        raise HTTPException(status_code=400, detail="Select at least 2 notes")
    if len(note_ids) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 notes at a time")

    result = await db.execute(
        select(Document).where(
            Document.id.in_(note_ids),
            Document.user_id == current_user.id,
            Document.deleted == False,
        )
    )
    notes = result.scalars().all()
    if len(notes) < 2:
        raise HTTPException(status_code=404, detail="Not enough valid notes found")

    sections = []
    titles = []
    for note in notes:
        title = note.title or "Untitled"
        titles.append(title)
        content = note.content or ""
        sections.append(f"## Source: {title}\n\n{content}")

    combined = "\n\n---\n\n".join(sections)

    if len(combined) > 15000:
        combined = combined[:15000] + "\n\n[... content truncated for length]"

    api_key = None
    if current_user.encrypted_anthropic_key:
        try:
            api_key = decrypt_api_key(current_user.encrypted_anthropic_key)
        except Exception:
            pass

    if api_key:
        from app.llm.service import evaluate_text

        prompt = (
            "Merge and deduplicate the following notes into a single, coherent document.\n\n"
            "Requirements:\n"
            "- Combine overlapping content, remove duplicates\n"
            "- Organize logically with clear headings\n"
            "- Preserve all unique information from each source\n"
            "- Use markdown formatting\n"
            "- Maintain the original meaning and detail\n\n"
            f"Source notes:\n\n{combined}\n\n"
            "Generate the merged document in markdown format. "
            "Start directly with the content, no preamble."
        )
        merged_content = await evaluate_text(prompt, api_key=api_key)
    else:
        merged_content = combined

    merged_title = body.get("title") or f"Merged — {', '.join(titles[:3])}"
    if len(titles) > 3:
        merged_title += f" +{len(titles) - 3} more"

    doc = Document(
        title=merged_title,
        content=merged_content,
        type="text",
        user_id=current_user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Auto-link to originals
    for note in notes:
        existing = await db.execute(
            select(DocumentLink).where(
                DocumentLink.user_id == current_user.id,
                or_(
                    and_(DocumentLink.source_id == doc.id, DocumentLink.target_id == note.id),
                    and_(DocumentLink.source_id == note.id, DocumentLink.target_id == doc.id),
                ),
            )
        )
        if not existing.scalar_one_or_none():
            db.add(DocumentLink(
                source_id=doc.id,
                target_id=note.id,
                user_id=current_user.id,
            ))

    # Redirect incoming links from originals to merged doc
    original_ids = [n.id for n in notes]
    link_result = await db.execute(
        select(DocumentLink).where(
            DocumentLink.user_id == current_user.id,
            or_(
                DocumentLink.source_id.in_(original_ids),
                DocumentLink.target_id.in_(original_ids),
            ),
        )
    )
    for link in link_result.scalars().all():
        other_id = link.target_id if link.source_id in original_ids else link.source_id
        if other_id == doc.id or other_id in original_ids:
            continue
        # Check if link to merged doc already exists
        dup = await db.execute(
            select(DocumentLink).where(
                DocumentLink.user_id == current_user.id,
                or_(
                    and_(DocumentLink.source_id == doc.id, DocumentLink.target_id == other_id),
                    and_(DocumentLink.source_id == other_id, DocumentLink.target_id == doc.id),
                ),
            )
        )
        if not dup.scalar_one_or_none():
            db.add(DocumentLink(
                source_id=doc.id,
                target_id=other_id,
                user_id=current_user.id,
            ))

    delete_originals = body.get("delete_originals", False)
    if delete_originals:
        for note in notes:
            note.deleted = True
            note.deleted_at = datetime.now(timezone.utc)

    await db.commit()

    # Background tasks
    from app.search.service import embed_document_background
    from app.notes.insights import analyze_document_background
    background_tasks.add_task(embed_document_background, doc.id)
    _ak = None
    if current_user.encrypted_anthropic_key:
        try:
            _ak = decrypt_api_key(current_user.encrypted_anthropic_key)
        except Exception:
            pass
    background_tasks.add_task(analyze_document_background, doc.id, doc.content or "", doc.title or "", _ak)

    await db.refresh(doc)
    return doc


@router.post("/{doc_id}/extract", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def extract_note(
    doc_id: int,
    body: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Extract selected content from a note into a new document."""
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
            Document.deleted == False,
        )
    )
    source_doc = result.scalar_one_or_none()
    if not source_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    extracted_content = body.get("content", "")
    if not extracted_content or not extracted_content.strip():
        raise HTTPException(status_code=400, detail="No content to extract")

    extract_title = body.get("title") or f"Extract from {source_doc.title or 'Untitled'}"

    new_doc = Document(
        title=extract_title,
        content=extracted_content,
        type="text",
        user_id=current_user.id,
    )
    db.add(new_doc)
    await db.commit()
    await db.refresh(new_doc)

    replace_with_link = body.get("replace_with_link", False)
    if replace_with_link and source_doc.content:
        link_text = f"[See: {extract_title}](/notes/{new_doc.id})"
        source_doc.content = source_doc.content.replace(extracted_content, link_text, 1)
        await db.commit()

    # Create bidirectional link
    db.add(DocumentLink(
        source_id=doc_id,
        target_id=new_doc.id,
        user_id=current_user.id,
    ))
    await db.commit()

    # Background tasks
    from app.search.service import embed_document_background
    from app.notes.insights import analyze_document_background
    background_tasks.add_task(embed_document_background, new_doc.id)
    _ak = None
    if current_user.encrypted_anthropic_key:
        try:
            _ak = decrypt_api_key(current_user.encrypted_anthropic_key)
        except Exception:
            pass
    background_tasks.add_task(analyze_document_background, new_doc.id, new_doc.content or "", new_doc.title or "", _ak)

    await db.refresh(new_doc)
    return new_doc


@router.get("/by-concept")
async def get_notes_by_concept(
    concept: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find notes related to a specific concept."""
    from app.knowledge.service import normalize_concept
    from app.knowledge.models import UserConcept, ConceptSource

    normalized = normalize_concept(concept)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid concept")

    result = await db.execute(
        select(UserConcept).where(
            UserConcept.user_id == current_user.id,
            UserConcept.normalized == normalized,
        )
    )
    matched_concept = result.scalar_one_or_none()

    matched_concept_name = matched_concept.concept if matched_concept else None
    note_results = []

    if matched_concept:
        source_result = await db.execute(
            select(ConceptSource).where(ConceptSource.concept_id == matched_concept.id)
        )
        sources = source_result.scalars().all()
        doc_ids = [s.document_id for s in sources]
        source_type_map = {s.document_id: s.source_type for s in sources}

        if doc_ids:
            doc_result = await db.execute(
                select(Document).where(
                    Document.id.in_(doc_ids),
                    Document.user_id == current_user.id,
                    Document.deleted == False,
                )
            )
            docs = doc_result.scalars().all()
            for doc in docs:
                note_results.append({
                    "id": doc.id,
                    "title": doc.title or "Untitled",
                    "preview": (doc.content or "")[:200],
                    "source_type": source_type_map.get(doc.id, "concept"),
                    "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
                })

    # Fallback to embedding similarity if no exact match
    if not note_results:
        try:
            from app.search.service import embed_text, cosine_similarity
            from app.search.models import NoteEmbedding

            concept_emb = await embed_text(normalized)

            emb_result = await db.execute(
                select(NoteEmbedding, Document).join(
                    Document, NoteEmbedding.document_id == Document.id
                ).where(
                    Document.user_id == current_user.id,
                    Document.deleted == False,
                )
            )
            rows = emb_result.all()

            scored = []
            for emb, doc in rows:
                doc_vec = json.loads(emb.embedding)
                sim = cosine_similarity(concept_emb, doc_vec)
                if sim > 0.35:
                    scored.append((sim, doc))

            scored.sort(key=lambda x: x[0], reverse=True)
            for sim, doc in scored[:10]:
                note_results.append({
                    "id": doc.id,
                    "title": doc.title or "Untitled",
                    "preview": (doc.content or "")[:200],
                    "source_type": "similarity",
                    "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
                })
        except Exception:
            logger.debug("Embedding fallback failed for concept search", exc_info=True)

    return {
        "concept": concept,
        "matched_concept": matched_concept_name,
        "notes": note_results,
    }
