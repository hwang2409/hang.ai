from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document, DocumentLink
from app.notes.schemas import DocumentLinkCreate, LinkedNoteResponse

router = APIRouter()


@router.get("/{doc_id}/links", response_model=list[LinkedNoteResponse])
async def list_document_links(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DocumentLink).where(
            DocumentLink.user_id == current_user.id,
            or_(
                DocumentLink.source_id == doc_id,
                DocumentLink.target_id == doc_id,
            ),
        )
    )
    links = result.scalars().all()

    linked_ids = set()
    link_map = {}
    for link in links:
        other_id = link.target_id if link.source_id == doc_id else link.source_id
        linked_ids.add(other_id)
        link_map[other_id] = link

    if not linked_ids:
        return []

    doc_result = await db.execute(
        select(Document).where(Document.id.in_(linked_ids), Document.deleted == False)  # noqa: E712
    )
    docs = doc_result.scalars().all()

    return [
        LinkedNoteResponse(
            link_id=link_map[doc.id].id,
            note_id=doc.id,
            title=doc.title or "Untitled",
            preview=(doc.content or "")[:200],
            type=doc.type,
            folder_id=doc.folder_id,
            created_at=link_map[doc.id].created_at,
        )
        for doc in docs
    ]


@router.post("/{doc_id}/links", response_model=LinkedNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_document_link(
    doc_id: int,
    body: DocumentLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.target_id == doc_id:
        raise HTTPException(status_code=400, detail="Cannot link a note to itself")

    # Verify both documents exist and belong to user
    for check_id in (doc_id, body.target_id):
        result = await db.execute(
            select(Document).where(
                Document.id == check_id,
                Document.user_id == current_user.id,
                Document.deleted == False,  # noqa: E712
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"Document {check_id} not found")

    # Check for existing link in either direction
    existing = await db.execute(
        select(DocumentLink).where(
            DocumentLink.user_id == current_user.id,
            or_(
                and_(DocumentLink.source_id == doc_id, DocumentLink.target_id == body.target_id),
                and_(DocumentLink.source_id == body.target_id, DocumentLink.target_id == doc_id),
            ),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Link already exists")

    link = DocumentLink(
        source_id=doc_id,
        target_id=body.target_id,
        user_id=current_user.id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    # Fetch target doc for response
    target = await db.execute(
        select(Document).where(Document.id == body.target_id)
    )
    doc = target.scalar_one()

    return LinkedNoteResponse(
        link_id=link.id,
        note_id=doc.id,
        title=doc.title or "Untitled",
        preview=(doc.content or "")[:200],
        type=doc.type,
        folder_id=doc.folder_id,
        created_at=link.created_at,
    )


@router.delete("/{doc_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document_link(
    doc_id: int,
    link_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DocumentLink).where(
            DocumentLink.id == link_id,
            DocumentLink.user_id == current_user.id,
            or_(
                DocumentLink.source_id == doc_id,
                DocumentLink.target_id == doc_id,
            ),
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    await db.delete(link)
    await db.commit()


# ── Smart Note Connections ────────────────────────────────────────────────────

@router.get("/{doc_id}/suggestions")
async def get_note_suggestions(
    doc_id: int,
    limit: int = Query(5, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return semantically similar notes that aren't already linked."""
    import json as _json
    from app.search.models import NoteEmbedding
    from app.search.service import cosine_similarity

    # Get the target note's embedding
    result = await db.execute(
        select(NoteEmbedding).where(NoteEmbedding.document_id == doc_id)
    )
    target_emb = result.scalar_one_or_none()
    if not target_emb:
        return []

    target_vec = _json.loads(target_emb.embedding)

    # Get IDs of already-linked notes
    link_result = await db.execute(
        select(DocumentLink).where(
            DocumentLink.user_id == current_user.id,
            or_(
                DocumentLink.source_id == doc_id,
                DocumentLink.target_id == doc_id,
            ),
        )
    )
    linked_ids = set()
    for link in link_result.scalars().all():
        linked_ids.add(link.target_id if link.source_id == doc_id else link.source_id)

    # Get all other embeddings for user's documents
    result = await db.execute(
        select(NoteEmbedding, Document).join(
            Document, NoteEmbedding.document_id == Document.id
        ).where(
            Document.user_id == current_user.id,
            Document.deleted == False,  # noqa: E712
            Document.id != doc_id,
            ~Document.id.in_(linked_ids) if linked_ids else True,
        )
    )
    rows = result.all()

    # Compute similarities and rank
    scored = []
    for emb, doc in rows:
        doc_vec = _json.loads(emb.embedding)
        sim = cosine_similarity(target_vec, doc_vec)
        if sim > 0.35:
            scored.append((sim, doc))

    scored.sort(key=lambda x: x[0], reverse=True)

    return [
        {
            "id": doc.id,
            "title": doc.title or "Untitled",
            "preview": (doc.content or "")[:150],
            "similarity": round(sim, 3),
            "type": doc.type,
        }
        for sim, doc in scored[:limit]
    ]
