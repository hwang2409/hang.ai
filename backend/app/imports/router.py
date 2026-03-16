import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document, Folder
from app.imports.extractors import extract_pdf_text, extract_pptx_text, extract_youtube_transcript
from app.imports.converter import convert_to_notes

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


class ExtractedContent(BaseModel):
    text: str
    source_name: str
    source_type: str  # pdf, pptx, youtube
    char_count: int


class YouTubeRequest(BaseModel):
    url: str


class ConvertRequest(BaseModel):
    text: str
    source_name: str = ""


class ConvertResponse(BaseModel):
    folder_id: Optional[int] = None
    folder_name: Optional[str] = None
    notes: list[dict]  # [{id, title}]


@router.post("/upload", response_model=ExtractedContent)
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a PDF or PPTX file and extract text."""
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large (max 50MB)")

    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf":
        text = await extract_pdf_text(content)
    elif ext in ("pptx", "ppt"):
        text = await extract_pptx_text(content)
    else:
        raise HTTPException(400, f"Unsupported file type: .{ext}. Supported: .pdf, .pptx")

    if not text.strip():
        raise HTTPException(400, "No text could be extracted from this file")

    source_name = filename.rsplit(".", 1)[0] if "." in filename else filename

    return ExtractedContent(
        text=text,
        source_name=source_name,
        source_type=ext,
        char_count=len(text),
    )


@router.post("/youtube", response_model=ExtractedContent)
async def import_youtube(
    body: YouTubeRequest,
    current_user: User = Depends(get_current_user),
):
    """Extract transcript from a YouTube video."""
    try:
        text, title = await extract_youtube_transcript(body.url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("YouTube extraction failed")
        raise HTTPException(400, f"Failed to extract transcript: {e}")

    if not text.strip():
        raise HTTPException(400, "No transcript available for this video")

    return ExtractedContent(
        text=text,
        source_name=title,
        source_type="youtube",
        char_count=len(text),
    )


@router.post("/convert", response_model=ConvertResponse)
async def convert(
    body: ConvertRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Convert extracted text into study notes using AI."""
    if not body.text.strip():
        raise HTTPException(400, "No text to convert")

    try:
        result = convert_to_notes(body.text, body.source_name)
    except Exception as e:
        logger.exception("Conversion failed")
        raise HTTPException(500, f"AI conversion failed: {e}")

    notes_data = result.get("notes", [])
    if not notes_data:
        raise HTTPException(500, "AI returned no notes")

    folder_name = result.get("folder_name") or body.source_name or "Imported Notes"
    folder = Folder(name=folder_name, user_id=current_user.id)
    db.add(folder)
    await db.flush()
    folder_id = folder.id

    # Create notes
    created_notes = []
    for note_data in notes_data:
        title = note_data.get("title", "Untitled")
        content = note_data.get("content", "")

        doc = Document(
            title=title,
            content=content,
            user_id=current_user.id,
            folder_id=folder_id,
        )
        db.add(doc)
        await db.flush()
        created_notes.append({"id": doc.id, "title": title})

    await db.commit()

    return ConvertResponse(
        folder_id=folder_id,
        folder_name=folder_name,
        notes=created_notes,
    )
