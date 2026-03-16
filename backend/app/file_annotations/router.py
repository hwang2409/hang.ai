from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.files.models import UploadedFile
from app.file_annotations.models import FileAnnotation
from app.file_annotations.schemas import FileAnnotationCreate, FileAnnotationUpdate, FileAnnotationResponse

router = APIRouter()


@router.get("", response_model=list[FileAnnotationResponse])
async def list_file_annotations(
    file_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify file ownership
    result = await db.execute(
        select(UploadedFile).where(
            UploadedFile.id == file_id,
            UploadedFile.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="File not found")

    result = await db.execute(
        select(FileAnnotation)
        .where(
            FileAnnotation.file_id == file_id,
            FileAnnotation.user_id == current_user.id,
        )
        .order_by(FileAnnotation.page_number.asc().nulls_last(), FileAnnotation.timestamp.asc().nulls_last(), FileAnnotation.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=FileAnnotationResponse, status_code=status.HTTP_201_CREATED)
async def create_file_annotation(
    body: FileAnnotationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify file ownership
    result = await db.execute(
        select(UploadedFile).where(
            UploadedFile.id == body.file_id,
            UploadedFile.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="File not found")

    annotation = FileAnnotation(
        file_id=body.file_id,
        user_id=current_user.id,
        annotation_type=body.annotation_type,
        selected_text=body.selected_text,
        annotation_content=body.annotation_content,
        page_number=body.page_number,
        timestamp=body.timestamp,
        color=body.color,
    )
    db.add(annotation)
    await db.commit()
    await db.refresh(annotation)
    return annotation


@router.put("/{ann_id}", response_model=FileAnnotationResponse)
async def update_file_annotation(
    ann_id: int,
    body: FileAnnotationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FileAnnotation).where(
            FileAnnotation.id == ann_id,
            FileAnnotation.user_id == current_user.id,
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
async def delete_file_annotation(
    ann_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FileAnnotation).where(
            FileAnnotation.id == ann_id,
            FileAnnotation.user_id == current_user.id,
        )
    )
    annotation = result.scalar_one_or_none()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    await db.delete(annotation)
    await db.commit()
