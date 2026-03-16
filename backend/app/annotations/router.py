from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document
from app.annotations.models import Annotation
from app.annotations.schemas import AnnotationCreate, AnnotationUpdate, AnnotationResponse

router = APIRouter()


@router.get("", response_model=list[AnnotationResponse])
async def list_annotations(
    document_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify document ownership
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    result = await db.execute(
        select(Annotation)
        .where(
            Annotation.document_id == document_id,
            Annotation.user_id == current_user.id,
        )
        .order_by(Annotation.start_offset)
    )
    return result.scalars().all()


@router.post("", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    body: AnnotationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify document ownership
    result = await db.execute(
        select(Document).where(
            Document.id == body.document_id,
            Document.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    annotation = Annotation(
        document_id=body.document_id,
        user_id=current_user.id,
        selected_text=body.selected_text,
        annotation_content=body.annotation_content,
        start_offset=body.start_offset,
        end_offset=body.end_offset,
        color=body.color,
    )
    db.add(annotation)
    await db.commit()
    await db.refresh(annotation)
    return annotation


@router.put("/{ann_id}", response_model=AnnotationResponse)
async def update_annotation(
    ann_id: int,
    body: AnnotationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Annotation).where(
            Annotation.id == ann_id,
            Annotation.user_id == current_user.id,
        )
    )
    annotation = result.scalar_one_or_none()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    if body.annotation_content is not None:
        annotation.annotation_content = body.annotation_content
    if body.color is not None:
        annotation.color = body.color

    await db.commit()
    await db.refresh(annotation)
    return annotation


@router.delete("/{ann_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    ann_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Annotation).where(
            Annotation.id == ann_id,
            Annotation.user_id == current_user.id,
        )
    )
    annotation = result.scalar_one_or_none()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    await db.delete(annotation)
    await db.commit()
