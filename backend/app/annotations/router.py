from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
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


# ── Annotation Export ─────────────────────────────────────────────────────

@router.get("/export")
async def export_annotations(
    background_tasks: BackgroundTasks,
    token: str = Query(...),
    note_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Export annotations as a markdown file."""
    from jose import jwt, JWTError
    from app.config import settings

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = int(payload.get("sub"))
    except (JWTError, Exception):
        raise HTTPException(status_code=401, detail="Invalid token")

    # Get document annotations
    query = select(Annotation, Document).join(
        Document, Annotation.document_id == Document.id
    ).where(
        Annotation.user_id == user_id,
    ).order_by(Document.title, Annotation.start_offset)

    if note_id:
        query = query.where(Annotation.document_id == note_id)

    result = await db.execute(query)
    doc_annotations = result.all()

    # Get file annotations (only if not filtering by note_id)
    file_annotations = []
    if not note_id:
        from app.file_annotations.models import FileAnnotation
        from app.files.models import UploadedFile

        fa_result = await db.execute(
            select(FileAnnotation, UploadedFile).join(
                UploadedFile, FileAnnotation.file_id == UploadedFile.id
            ).where(
                FileAnnotation.user_id == user_id,
            ).order_by(UploadedFile.original_name, FileAnnotation.page_number.asc().nulls_last())
        )
        file_annotations = fa_result.all()

    if not doc_annotations and not file_annotations:
        raise HTTPException(status_code=404, detail="No annotations to export")

    # Build markdown
    lines = ["# Annotations Export\n\n"]
    lines.append(f"*Exported from Hang.ai*\n\n---\n\n")

    if doc_annotations:
        lines.append("## Document Annotations\n\n")
        current_doc = None
        for ann, doc in doc_annotations:
            if current_doc != doc.id:
                current_doc = doc.id
                lines.append(f"### {doc.title or 'Untitled'}\n\n")
            lines.append(f"> {ann.selected_text}\n\n")
            if ann.annotation_content:
                lines.append(f"{ann.annotation_content}\n\n")
            lines.append("---\n\n")

    if file_annotations:
        lines.append("## File Annotations\n\n")
        current_file = None
        for ann, file in file_annotations:
            if current_file != file.id:
                current_file = file.id
                lines.append(f"### {file.original_name}\n\n")
            location = ""
            if ann.page_number:
                location = f" (page {ann.page_number})"
            elif ann.timestamp:
                mins = int(ann.timestamp // 60)
                secs = int(ann.timestamp % 60)
                location = f" ({mins}:{secs:02d})"
            if ann.selected_text:
                lines.append(f"> {ann.selected_text}{location}\n\n")
            elif location:
                lines.append(f"*{location.strip(' ()')}*\n\n")
            if ann.annotation_content:
                lines.append(f"{ann.annotation_content}\n\n")
            lines.append("---\n\n")

    content = "".join(lines)

    import os
    import tempfile

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".md", mode="w", encoding="utf-8")
    tmp.write(content)
    tmp.close()

    background_tasks.add_task(os.unlink, tmp.name)

    from starlette.responses import FileResponse
    return FileResponse(
        tmp.name,
        media_type="text/markdown",
        filename="annotations-export.md",
        headers={"Content-Disposition": 'attachment; filename="annotations-export.md"'},
    )
