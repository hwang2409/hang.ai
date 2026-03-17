import json
import logging
import os
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Query, UploadFile, File
from jose import JWTError, jwt as jose_jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse as StarletteFileResponse

from app.config import settings
from app.deps import get_db, get_current_user
from app.auth.models import User
from app.files.models import UploadedFile
from app.files.schemas import FileResponse
from pydantic import BaseModel
from app.files.transcription import transcribe_audio_background
from app.imports.extractors import (
    extract_pdf_text, extract_pptx_text,
    detect_url_type, extract_arxiv_content, extract_webpage_content,
    extract_youtube_transcript,
)


logger = logging.getLogger(__name__)

router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media", "files")

EXTENSION_TYPE_MAP = {
    ".pdf": "pdf",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".gif": "image",
    ".webp": "image",
    ".svg": "image",
    ".mp4": "video",
    ".webm": "video",
    ".mov": "video",
    ".mp3": "audio",
    ".wav": "audio",
    ".m4a": "audio",
    ".ogg": "audio",
    ".pptx": "pdf",  # treat pptx as document type
}

MIME_MAP = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def _file_to_response(f: UploadedFile) -> dict:
    metadata = None
    if f.metadata_json:
        try:
            metadata = json.loads(f.metadata_json)
        except Exception:
            pass
    resp = {
        "id": f.id,
        "original_name": f.original_name,
        "file_type": f.file_type,
        "mime_type": f.mime_type,
        "size_bytes": f.size_bytes,
        "folder_id": f.folder_id,
        "has_extracted_text": bool(f.extracted_text),
        "metadata": metadata,
        "source_url": f.source_url,
        "created_at": f.created_at,
        "updated_at": f.updated_at,
    }
    if f.file_type == "audio":
        resp["transcription_status"] = "complete" if f.extracted_text else "pending"
    return resp


@router.post("", response_model=FileResponse, status_code=201)
async def upload_file_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder_id: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large (max 50MB)")

    original_name = file.filename or "unnamed"
    ext = ""
    if "." in original_name:
        ext = "." + original_name.rsplit(".", 1)[-1].lower()

    if ext not in EXTENSION_TYPE_MAP:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    file_type = EXTENSION_TYPE_MAP[ext]
    mime_type = MIME_MAP.get(ext, file.content_type or "application/octet-stream")

    # Browser MediaRecorder produces audio/webm — override video classification
    if ext == ".webm" and file.content_type and "audio" in file.content_type:
        file_type = "audio"
        mime_type = "audio/webm"

    # Save to disk
    uuid_name = f"{uuid.uuid4().hex}{ext}"
    os.makedirs(MEDIA_DIR, exist_ok=True)
    file_path = os.path.join(MEDIA_DIR, uuid_name)
    with open(file_path, "wb") as f:
        f.write(content)

    # Extract text for supported types
    extracted_text = None
    metadata = {}

    if ext == ".pdf":
        try:
            extracted_text = await extract_pdf_text(content)
            from PyPDF2 import PdfReader
            import io
            reader = PdfReader(io.BytesIO(content))
            metadata["page_count"] = len(reader.pages)
        except Exception as e:
            logger.warning(f"PDF text extraction failed: {e}")
    elif ext == ".pptx":
        try:
            extracted_text = await extract_pptx_text(content)
            from pptx import Presentation
            import io
            prs = Presentation(io.BytesIO(content))
            metadata["page_count"] = len(prs.slides)
        except Exception as e:
            logger.warning(f"PPTX text extraction failed: {e}")

    metadata_json = json.dumps(metadata) if metadata else None

    record = UploadedFile(
        user_id=current_user.id,
        filename=uuid_name,
        original_name=original_name,
        file_type=file_type,
        mime_type=mime_type,
        file_path=f"media/files/{uuid_name}",
        size_bytes=len(content),
        metadata_json=metadata_json,
        folder_id=folder_id,
        extracted_text=extracted_text,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    # Trigger background transcription for audio files
    if file_type == "audio":
        background_tasks.add_task(transcribe_audio_background, record.id, file_path)

    return _file_to_response(record)


@router.get("", response_model=list[FileResponse])
async def list_files(
    file_type: Optional[str] = Query(None),
    folder_id: Optional[int] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(UploadedFile).where(
        UploadedFile.user_id == current_user.id,
        UploadedFile.deleted == False,
    )
    if file_type:
        stmt = stmt.where(UploadedFile.file_type == file_type)
    if folder_id is not None:
        stmt = stmt.where(UploadedFile.folder_id == folder_id)

    stmt = stmt.order_by(UploadedFile.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [_file_to_response(f) for f in result.scalars().all()]


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UploadedFile).where(
            UploadedFile.id == file_id,
            UploadedFile.user_id == current_user.id,
            UploadedFile.deleted == False,
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "File not found")
    return _file_to_response(f)


@router.get("/{file_id}/serve")
async def serve_file(
    file_id: int,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Serve file bytes. Auth via query token (same pattern as image-proxy)."""
    try:
        payload = jose_jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id = int(payload.get("sub", 0))
        if not user_id:
            raise HTTPException(401, "Invalid token")
    except (JWTError, ValueError):
        raise HTTPException(401, "Invalid token")

    result = await db.execute(
        select(UploadedFile).where(
            UploadedFile.id == file_id,
            UploadedFile.user_id == user_id,
            UploadedFile.deleted == False,
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "File not found")
    if f.file_type == "link":
        # Proxy external PDFs (e.g. arXiv) so the frontend PdfViewer can render them
        metadata = {}
        if f.metadata_json:
            try:
                metadata = json.loads(f.metadata_json)
            except Exception:
                pass
        pdf_url = metadata.get("pdf_url")
        if not pdf_url:
            raise HTTPException(400, "Link-type files have no binary content to serve")
        import httpx
        from starlette.responses import Response
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(pdf_url, headers={"User-Agent": "Mozilla/5.0 (compatible; HangBot/1.0)"})
            resp.raise_for_status()
        return Response(
            content=resp.content,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{f.original_name}.pdf"'},
        )

    abs_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        f.file_path,
    )
    if not os.path.isfile(abs_path):
        raise HTTPException(404, "File not found on disk")

    return StarletteFileResponse(
        abs_path,
        media_type=f.mime_type,
        filename=f.original_name,
    )


@router.get("/{file_id}/text")
async def get_file_text(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get extracted text for a file (used for convert-to-notes)."""
    result = await db.execute(
        select(UploadedFile).where(
            UploadedFile.id == file_id,
            UploadedFile.user_id == current_user.id,
            UploadedFile.deleted == False,
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "File not found")
    if not f.extracted_text:
        raise HTTPException(400, "No extracted text available for this file")
    return {"text": f.extracted_text, "source_name": f.original_name}


@router.delete("/{file_id}", status_code=204)
async def delete_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UploadedFile).where(
            UploadedFile.id == file_id,
            UploadedFile.user_id == current_user.id,
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "File not found")
    f.deleted = True
    await db.commit()


@router.post("/{file_id}/transcribe")
async def transcribe_file(
    file_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually trigger transcription for an audio file."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(400, "Transcription unavailable: OPENAI_API_KEY not configured")

    result = await db.execute(
        select(UploadedFile).where(
            UploadedFile.id == file_id,
            UploadedFile.user_id == current_user.id,
            UploadedFile.deleted == False,
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "File not found")
    if f.file_type != "audio":
        raise HTTPException(400, "Only audio files can be transcribed")

    abs_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        f.file_path,
    )
    background_tasks.add_task(transcribe_audio_background, f.id, abs_path)
    return {"status": "transcribing"}


class ImportUrlRequest(BaseModel):
    url: str
    folder_id: Optional[int] = None


def _extract_youtube_id(url: str) -> Optional[str]:
    import re as _re
    for pat in [r'(?:v=|/v/|youtu\.be/)([a-zA-Z0-9_-]{11})', r'(?:embed/)([a-zA-Z0-9_-]{11})']:
        match = _re.search(pat, url)
        if match:
            return match.group(1)
    return None


@router.post("/import-url", response_model=FileResponse, status_code=201)
async def import_url(
    body: ImportUrlRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import a URL (YouTube, arXiv, or webpage) as a library resource."""
    url = body.url.strip()
    if not url:
        raise HTTPException(400, "URL is required")

    url_type = detect_url_type(url)

    try:
        if url_type == "youtube":
            text, title = await extract_youtube_transcript(url)
            video_id = _extract_youtube_id(url)
            thumbnail = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg" if video_id else None
            metadata = {
                "title": title,
                "domain": "youtube.com",
                "thumbnail_url": thumbnail,
                "video_id": video_id,
                "description": text[:300] if text else None,
            }
        elif url_type == "arxiv":
            text, title, metadata = await extract_arxiv_content(url)
        else:
            text, title, metadata = await extract_webpage_content(url)
    except Exception as e:
        logger.error(f"URL extraction failed for {url}: {e}")
        raise HTTPException(400, f"Failed to extract content from URL: {e}")

    from urllib.parse import urlparse as _urlparse
    domain = _urlparse(url).hostname or ""

    record = UploadedFile(
        user_id=current_user.id,
        filename=f"link_{uuid.uuid4().hex[:8]}",
        original_name=title or domain or url,
        file_type="link",
        mime_type="text/html",
        file_path="",
        size_bytes=len(text.encode("utf-8")) if text else 0,
        metadata_json=json.dumps(metadata) if metadata else None,
        folder_id=body.folder_id,
        extracted_text=text,
        source_url=url,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return _file_to_response(record)
