import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document

router = APIRouter()


@router.get("/shared/{share_token}")
async def get_shared_note(
    share_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — no auth required. Returns note content by share token."""
    result = await db.execute(
        select(Document).where(
            Document.share_token == share_token,
            Document.deleted == False,  # noqa: E712
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Shared note not found")
    return {
        "title": doc.title,
        "content": doc.content,
        "type": doc.type,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
    }


@router.post("/{doc_id}/share")
async def share_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a share token for a note. Returns the token."""
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
    if not doc.share_token:
        doc.share_token = secrets.token_urlsafe(32)
        await db.commit()
        await db.refresh(doc)
    return {"share_token": doc.share_token}


@router.delete("/{doc_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def unshare_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke sharing for a note."""
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.share_token = None
    await db.commit()
