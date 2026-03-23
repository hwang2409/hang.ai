import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

logger = logging.getLogger(__name__)
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document, Folder, Tag, document_tags
from app.notes.schemas import (
    DocumentCreate,
    DocumentListResponse,
    DocumentResponse,
    DocumentUpdate,
    FolderCreate,
    FolderResponse,
    NoteAccessInfo,
    TagCreate,
    TagResponse,
    SearchRequest,
)
from app.social.schemas import SuggestionCreate, SuggestionResponse
from app.crypto import decrypt_api_key
from app.notes.insights import analyze_document_background
from app.automations.engine import fire_event

from app.notes.sharing import router as sharing_router
from app.notes.export import router as export_router
from app.notes.linking import router as linking_router
from app.notes.insights import router as insights_router
from app.notes.refactoring import router as refactoring_router

router = APIRouter()

IMAGE_RE = re.compile(r"!\[.*?\]\((.*?)\)")


def extract_preview_image(content: str) -> Optional[str]:
    match = IMAGE_RE.search(content)
    return match.group(1) if match else None


def doc_to_list_response(doc: Document) -> DocumentListResponse:
    return DocumentListResponse(
        id=doc.id,
        title=doc.title,
        preview=doc.content[:200] if doc.content else "",
        type=doc.type,
        user_id=doc.user_id,
        folder_id=doc.folder_id,
        preview_image_url=doc.preview_image_url,
        deleted=doc.deleted,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        tags=[TagResponse.model_validate(t) for t in doc.tags],
    )


async def _resolve_tags(db: AsyncSession, tag_ids: list[int], user_id: int) -> list[Tag]:
    if not tag_ids:
        return []
    result = await db.execute(
        select(Tag).where(Tag.id.in_(tag_ids), Tag.user_id == user_id)
    )
    return list(result.scalars().all())


async def _resolve_tag_names(db: AsyncSession, names: list[str], user_id: int) -> list[Tag]:
    """Resolve tag names to Tag objects, creating any that don't exist."""
    if not names:
        return []
    tags = []
    for name in names:
        name = name.strip()
        if not name:
            continue
        result = await db.execute(
            select(Tag).where(Tag.name == name, Tag.user_id == user_id)
        )
        tag = result.scalar_one_or_none()
        if not tag:
            tag = Tag(name=name, user_id=user_id)
            db.add(tag)
            await db.flush()
        tags.append(tag)
    return tags


# ── Documents ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DocumentListResponse])
async def list_documents(
    folder_id: Optional[int] = Query(None),
    tag_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Document).where(
        Document.user_id == current_user.id,
        Document.deleted == False,  # noqa: E712
    )
    if folder_id is not None:
        stmt = stmt.where(Document.folder_id == folder_id)
    if tag_id is not None:
        stmt = stmt.where(Document.tags.any(Tag.id == tag_id))
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(Document.title.ilike(pattern))
    stmt = stmt.order_by(Document.updated_at.desc())

    result = await db.execute(stmt)
    docs = result.scalars().all()
    return [doc_to_list_response(d) for d in docs]


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    body: DocumentCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.content and body.type == "moodboard":
        try:
            import json as _json
            mb = _json.loads(body.content)
            first_img = next((i for i in mb.get("items", []) if i.get("type") == "image" and i.get("url")), None)
            preview_image = first_img["url"] if first_img else None
        except Exception:
            preview_image = None
    elif body.content and body.type not in ("canvas", "moodboard"):
        preview_image = extract_preview_image(body.content)
    else:
        preview_image = None
    tags = await _resolve_tags(db, body.tag_ids, current_user.id)

    doc = Document(
        title=body.title,
        content=body.content,
        type=body.type,
        user_id=current_user.id,
        folder_id=body.folder_id,
        preview_image_url=preview_image,
        tags=tags,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    if body.content and body.type not in ("canvas", "moodboard"):
        from app.search.service import embed_document_background
        background_tasks.add_task(embed_document_background, doc.id)

    from app.social.activity import log_activity
    background_tasks.add_task(log_activity, current_user.id, "note_created", {"title": doc.title, "note_id": doc.id})

    return doc


@router.get("/trash", response_model=list[DocumentListResponse])
async def list_trash(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id, Document.deleted == True)  # noqa: E712
        .order_by(Document.deleted_at.desc())
    )
    docs = result.scalars().all()
    return [doc_to_list_response(d) for d in docs]


# ── Folders ────────────────────────────────────────────────────────────────────

@router.post("/folders", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    body: FolderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folder = Folder(
        name=body.name,
        parent_id=body.parent_id,
        user_id=current_user.id,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder


@router.get("/folders", response_model=list[FolderResponse])
async def list_folders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Folder).where(Folder.user_id == current_user.id).order_by(Folder.name)
    )
    return result.scalars().all()


@router.put("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: int,
    body: FolderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id)
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    folder.name = body.name
    folder.parent_id = body.parent_id
    await db.commit()
    await db.refresh(folder)
    return folder


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id)
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    await db.delete(folder)
    await db.commit()


# Include sub-routers with static paths before /{doc_id} catch-all routes
router.include_router(refactoring_router)

# ── Access Info ───────────────────────────────────────────────────────────────

@router.get("/{doc_id}/access", response_model=NoteAccessInfo)
async def get_note_access(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.social.models import GroupSharedNote, StudyGroupMember

    # Check ownership
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.deleted == False)  # noqa: E712
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.user_id == current_user.id:
        return NoteAccessInfo(
            is_owner=True,
            permission=None,
            author_username=current_user.username,
            author_id=current_user.id,
        )

    # Check shared access
    result = await db.execute(
        select(GroupSharedNote.permission, User.username, User.id)
        .join(StudyGroupMember, StudyGroupMember.group_id == GroupSharedNote.group_id)
        .join(User, User.id == doc.user_id)
        .where(
            GroupSharedNote.note_id == doc_id,
            StudyGroupMember.user_id == current_user.id,
        )
        .limit(1)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")

    return NoteAccessInfo(
        is_owner=False,
        permission=row[0],
        author_username=row[1],
        author_id=row[2],
    )


@router.post("/{doc_id}/copy", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def copy_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.social.models import GroupSharedNote, StudyGroupMember

    # Get the document (owner or shared access)
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.deleted == False)  # noqa: E712
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.user_id != current_user.id:
        # Check shared access
        result = await db.execute(
            select(GroupSharedNote.id)
            .join(StudyGroupMember, StudyGroupMember.group_id == GroupSharedNote.group_id)
            .where(
                GroupSharedNote.note_id == doc_id,
                StudyGroupMember.user_id == current_user.id,
            )
            .limit(1)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Document not found")

    copy = Document(
        title=f"Copy of {doc.title}",
        content=doc.content,
        type=doc.type,
        user_id=current_user.id,
    )
    db.add(copy)
    await db.commit()
    await db.refresh(copy)
    return copy


# ── Edit Suggestions ──────────────────────────────────────────────────────────

@router.post("/{doc_id}/edit-suggestions", response_model=SuggestionResponse, status_code=status.HTTP_201_CREATED)
async def create_edit_suggestion(
    doc_id: int,
    body: SuggestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.social.models import GroupSharedNote, StudyGroupMember, NoteSuggestion

    # Verify suggest permission
    result = await db.execute(
        select(GroupSharedNote.permission)
        .join(StudyGroupMember, StudyGroupMember.group_id == GroupSharedNote.group_id)
        .where(
            GroupSharedNote.note_id == doc_id,
            StudyGroupMember.user_id == current_user.id,
        )
        .limit(1)
    )
    row = result.first()
    if not row or row[0] != "suggest":
        raise HTTPException(status_code=403, detail="Suggest permission required")

    suggestion = NoteSuggestion(
        document_id=doc_id,
        user_id=current_user.id,
        suggested_title=body.suggested_title,
        suggested_content=body.suggested_content,
    )
    db.add(suggestion)
    await db.commit()
    await db.refresh(suggestion)

    return SuggestionResponse(
        id=suggestion.id,
        document_id=suggestion.document_id,
        user_id=suggestion.user_id,
        username=current_user.username,
        suggested_title=suggestion.suggested_title,
        suggested_content=suggestion.suggested_content,
        status=suggestion.status,
        created_at=suggestion.created_at,
        resolved_at=suggestion.resolved_at,
    )


@router.get("/{doc_id}/edit-suggestions", response_model=list[SuggestionResponse])
async def list_edit_suggestions(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.social.models import NoteSuggestion

    # Check if owner
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.deleted == False)  # noqa: E712
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.user_id == current_user.id:
        # Owner sees all suggestions
        result = await db.execute(
            select(NoteSuggestion, User.username)
            .join(User, NoteSuggestion.user_id == User.id)
            .where(NoteSuggestion.document_id == doc_id)
            .order_by(NoteSuggestion.created_at.desc())
        )
    else:
        # Non-owner sees only their own
        result = await db.execute(
            select(NoteSuggestion, User.username)
            .join(User, NoteSuggestion.user_id == User.id)
            .where(
                NoteSuggestion.document_id == doc_id,
                NoteSuggestion.user_id == current_user.id,
            )
            .order_by(NoteSuggestion.created_at.desc())
        )

    rows = result.all()
    return [
        SuggestionResponse(
            id=s.id,
            document_id=s.document_id,
            user_id=s.user_id,
            username=username,
            suggested_title=s.suggested_title,
            suggested_content=s.suggested_content,
            status=s.status,
            created_at=s.created_at,
            resolved_at=s.resolved_at,
        )
        for s, username in rows
    ]


@router.post("/{doc_id}/edit-suggestions/{suggestion_id}/accept", response_model=DocumentResponse)
async def accept_edit_suggestion(
    doc_id: int,
    suggestion_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.social.models import NoteSuggestion

    # Verify ownership
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
            Document.deleted == False,  # noqa: E712
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    result = await db.execute(
        select(NoteSuggestion).where(
            NoteSuggestion.id == suggestion_id,
            NoteSuggestion.document_id == doc_id,
            NoteSuggestion.status == "pending",
        )
    )
    suggestion = result.scalar_one_or_none()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    # Apply suggestion
    doc.content = suggestion.suggested_content
    if suggestion.suggested_title:
        doc.title = suggestion.suggested_title
    suggestion.status = "accepted"
    suggestion.resolved_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(doc)
    return doc


@router.post("/{doc_id}/edit-suggestions/{suggestion_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_edit_suggestion(
    doc_id: int,
    suggestion_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.social.models import NoteSuggestion

    # Verify ownership
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    result = await db.execute(
        select(NoteSuggestion).where(
            NoteSuggestion.id == suggestion_id,
            NoteSuggestion.document_id == doc_id,
            NoteSuggestion.status == "pending",
        )
    )
    suggestion = result.scalar_one_or_none()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    suggestion.status = "rejected"
    suggestion.resolved_at = datetime.now(timezone.utc)
    await db.commit()


# ── Documents (by ID) ─────────────────────────────────────────────────────────

@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Owner access
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
            Document.deleted == False,  # noqa: E712
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        # Check if note is shared in a group the user belongs to
        from app.social.models import GroupSharedNote, StudyGroupMember
        result = await db.execute(
            select(Document)
            .join(GroupSharedNote, GroupSharedNote.note_id == Document.id)
            .join(StudyGroupMember, StudyGroupMember.group_id == GroupSharedNote.group_id)
            .where(
                Document.id == doc_id,
                Document.deleted == False,  # noqa: E712
                StudyGroupMember.user_id == current_user.id,
            )
        )
        doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.put("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: int,
    body: DocumentUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
            Document.deleted == False,  # noqa: E712
        )
    )
    doc = result.scalar_one_or_none()
    shared_edit = False

    if not doc:
        # Check if user has "edit" permission via a shared group
        from app.social.models import GroupSharedNote, StudyGroupMember
        result = await db.execute(
            select(Document, GroupSharedNote.permission)
            .join(GroupSharedNote, GroupSharedNote.note_id == Document.id)
            .join(StudyGroupMember, StudyGroupMember.group_id == GroupSharedNote.group_id)
            .where(
                Document.id == doc_id,
                Document.deleted == False,  # noqa: E712
                StudyGroupMember.user_id == current_user.id,
                GroupSharedNote.permission == "edit",
            )
            .limit(1)
        )
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        doc = row[0]
        shared_edit = True

    content_changed = False
    if body.title is not None:
        doc.title = body.title
        content_changed = True
    if body.content is not None:
        doc.content = body.content
        if doc.type == "moodboard":
            try:
                import json as _json
                mb = _json.loads(body.content)
                first_img = next((i for i in mb.get("items", []) if i.get("type") == "image" and i.get("url")), None)
                doc.preview_image_url = first_img["url"] if first_img else None
            except Exception:
                doc.preview_image_url = None
        elif doc.type not in ("canvas", "moodboard"):
            doc.preview_image_url = extract_preview_image(body.content)
        content_changed = True

    # Only owner can change folder and tags
    if not shared_edit:
        if body.folder_id is not None:
            if body.folder_id != 0:
                folder_check = await db.execute(
                    select(Folder).where(Folder.id == body.folder_id, Folder.user_id == current_user.id)
                )
                if not folder_check.scalar_one_or_none():
                    raise HTTPException(status_code=404, detail="Folder not found")
            doc.folder_id = body.folder_id if body.folder_id != 0 else None
        if body.tags is not None:
            doc.tags = await _resolve_tag_names(db, body.tags, current_user.id)
        elif body.tag_ids is not None:
            doc.tags = await _resolve_tags(db, body.tag_ids, current_user.id)

    await db.commit()
    await db.refresh(doc)

    if content_changed and doc.type not in ("canvas", "moodboard"):
        from app.search.service import embed_document_background
        background_tasks.add_task(embed_document_background, doc.id)
        _ak = None
        if current_user.encrypted_anthropic_key:
            try:
                _ak = decrypt_api_key(current_user.encrypted_anthropic_key)
            except Exception:
                pass
        background_tasks.add_task(analyze_document_background, doc.id, doc.content or "", doc.title or "", _ak)

    background_tasks.add_task(fire_event, current_user.id, "note_updated", {"note_id": doc.id, "title": doc.title or ""})

    return doc


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def soft_delete_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
            Document.deleted == False,  # noqa: E712
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.deleted = True
    doc.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.post("/{doc_id}/restore", response_model=DocumentResponse)
async def restore_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
            Document.deleted == True,  # noqa: E712
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found in trash")

    doc.deleted = False
    doc.deleted_at = None
    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/{doc_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanent_delete_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await db.delete(doc)
    await db.commit()


@router.post("/search", response_model=list[DocumentListResponse])
async def search_documents(
    body: SearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pattern = f"%{body.query}%"
    result = await db.execute(
        select(Document).where(
            Document.user_id == current_user.id,
            Document.deleted == False,  # noqa: E712
            or_(
                Document.title.ilike(pattern),
                Document.content.ilike(pattern),
            ),
        ).order_by(Document.updated_at.desc())
    )
    docs = result.scalars().all()
    return [doc_to_list_response(d) for d in docs]


# ── Tags ───────────────────────────────────────────────────────────────────────

@router.post("/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    body: TagCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check if tag already exists for user
    result = await db.execute(
        select(Tag).where(Tag.name == body.name, Tag.user_id == current_user.id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    tag = Tag(name=body.name, user_id=current_user.id)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.get("/tags", response_model=list[TagResponse])
async def list_tags(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Tag).where(Tag.user_id == current_user.id).order_by(Tag.name)
    )
    return result.scalars().all()


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == current_user.id)
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    await db.delete(tag)
    await db.commit()


# ── Include sub-routers ───────────────────────────────────────────────────────

router.include_router(sharing_router)
router.include_router(export_router)
router.include_router(linking_router)
router.include_router(insights_router)
