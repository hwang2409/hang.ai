import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from starlette.responses import Response
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document, DocumentLink, Folder, NoteAnalysis, Tag, document_tags
from app.notes.schemas import (
    DocumentCreate,
    DocumentListResponse,
    DocumentResponse,
    DocumentUpdate,
    FolderCreate,
    FolderResponse,
    TagCreate,
    TagResponse,
    SearchRequest,
    DocumentLinkCreate,
    LinkedNoteResponse,
)

router = APIRouter()

IMAGE_RE = re.compile(r"!\[.*?\]\((.*?)\)")

_BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}
_BLOCKED_PREFIXES = ("10.", "192.168.", "172.16.")
MAX_PROXY_BYTES = 10 * 1024 * 1024  # 10MB


@router.get("/image-proxy")
async def image_proxy(
    url: str = Query(...),
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Proxy external images to avoid hotlink blocking and CORS issues.

    Uses token as query param since <img src> can't send Authorization headers.
    """
    from jose import JWTError, jwt as jose_jwt
    from app.config import settings
    try:
        payload = jose_jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = int(payload.get("sub", 0))
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL scheme")
    hostname = parsed.hostname or ""
    if hostname in _BLOCKED_HOSTS or hostname.startswith(_BLOCKED_PREFIXES):
        raise HTTPException(status_code=400, detail="Blocked host")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "image/*,*/*",
                "Referer": parsed.scheme + "://" + parsed.netloc + "/",
            })
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "").split(";")[0].strip()
            # Allow image/* and application/octet-stream (some CDNs use this for images)
            if not content_type.startswith("image/") and content_type != "application/octet-stream":
                raise HTTPException(status_code=400, detail=f"Not an image: {content_type}")
            # Default to image/jpeg for octet-stream
            if content_type == "application/octet-stream":
                content_type = "image/jpeg"

            data = resp.content
            if len(data) > MAX_PROXY_BYTES:
                raise HTTPException(status_code=400, detail="Image too large")

            return Response(
                content=data,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*",
                },
            )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e.response.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch: {str(e)}")


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


# ── Documents (by ID) ─────────────────────────────────────────────────────────

@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
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
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

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
    if body.folder_id is not None:
        doc.folder_id = body.folder_id
    if body.tags is not None:
        doc.tags = await _resolve_tag_names(db, body.tags, current_user.id)
    elif body.tag_ids is not None:
        doc.tags = await _resolve_tags(db, body.tag_ids, current_user.id)

    await db.commit()
    await db.refresh(doc)

    if content_changed and doc.type not in ("canvas", "moodboard"):
        from app.search.service import embed_document_background
        background_tasks.add_task(embed_document_background, doc.id)
        background_tasks.add_task(analyze_document_background, doc.id, doc.content or "", doc.title or "")

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


# ── Document Links ─────────────────────────────────────────────────────────────

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


# ── Note Analysis ──────────────────────────────────────────────────────────────

async def analyze_document_background(doc_id: int, content: str, title: str):
    """Background task: run LLM analysis on note content and cache results."""
    from app.database import async_session
    from app.llm.service import evaluate_text
    from app.llm.response_parser import parse_llm_json

    content_hash = hashlib.sha256((title + content).encode()).hexdigest()

    async with async_session() as db:
        # Check if analysis is already up-to-date
        result = await db.execute(
            select(NoteAnalysis).where(NoteAnalysis.document_id == doc_id)
        )
        existing = result.scalar_one_or_none()
        if existing and existing.content_hash == content_hash:
            return  # Content hasn't changed, skip

        prompt = f"""Analyze the following note and extract structured information.

Title: {title}

Content:
{content[:6000]}

Return ONLY a JSON object with these fields:
- "summary": A 2-3 sentence summary of the note's main points.
- "concepts": An array of key concepts/topics mentioned (strings, max 12). Each should be a short noun phrase.
- "definitions": An array of objects with "term" and "definition" keys for any definitions found (explicit or implicit). Max 8.
- "formulas": An array of objects with "latex" (the LaTeX expression) and "description" (what it represents) for any math formulas found. Max 8.
- "suggested_tags": An array of 2-5 suggested tag names (short, lowercase) for organizing this note.
- "prerequisites": An array of concepts/topics that this note assumes prior knowledge of (strings, max 6).

If a field has no items, use an empty array. Always include all fields."""

        try:
            raw = await evaluate_text(prompt)
            analysis = parse_llm_json(raw)
            # Validate structure
            for key in ("summary", "concepts", "definitions", "formulas", "suggested_tags", "prerequisites"):
                if key not in analysis:
                    analysis[key] = [] if key != "summary" else ""
        except Exception:
            return  # Silently fail — analysis is optional

        analysis_str = json.dumps(analysis)

        if existing:
            existing.analysis_json = analysis_str
            existing.content_hash = content_hash
        else:
            db.add(NoteAnalysis(
                document_id=doc_id,
                analysis_json=analysis_str,
                content_hash=content_hash,
            ))
        await db.commit()


@router.get("/{doc_id}/analysis")
async def get_document_analysis(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get cached analysis for a document."""
    # Verify ownership
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
            Document.deleted == False,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    result = await db.execute(
        select(NoteAnalysis).where(NoteAnalysis.document_id == doc_id)
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        return {"status": "pending", "analysis": None}

    import json as _json
    return {"status": "ready", "analysis": _json.loads(analysis.analysis_json)}


@router.post("/{doc_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
async def trigger_document_analysis(
    doc_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger analysis for a document (runs in background)."""
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
            Document.deleted == False,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    background_tasks.add_task(analyze_document_background, doc.id, doc.content or "", doc.title or "")
    return {"status": "analyzing"}


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
