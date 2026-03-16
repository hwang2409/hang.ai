from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document
from app.lookups.models import Lookup
from app.lookups.schemas import LookupCreate, LookupResponse

router = APIRouter()


@router.get("", response_model=list[LookupResponse])
async def list_lookups(
    document_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    result = await db.execute(
        select(Lookup)
        .where(
            Lookup.document_id == document_id,
            Lookup.user_id == current_user.id,
        )
        .order_by(Lookup.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=LookupResponse, status_code=status.HTTP_201_CREATED)
async def create_lookup(
    body: LookupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            Document.id == body.document_id,
            Document.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    lookup = Lookup(
        document_id=body.document_id,
        user_id=current_user.id,
        action=body.action,
        selected_text=body.selected_text,
        result=body.result,
    )
    db.add(lookup)
    await db.commit()
    await db.refresh(lookup)
    return lookup


@router.delete("/{lookup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lookup(
    lookup_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Lookup).where(
            Lookup.id == lookup_id,
            Lookup.user_id == current_user.id,
        )
    )
    lookup = result.scalar_one_or_none()
    if not lookup:
        raise HTTPException(status_code=404, detail="Lookup not found")

    await db.delete(lookup)
    await db.commit()
