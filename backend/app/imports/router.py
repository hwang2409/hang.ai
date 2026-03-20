import logging
import os
import re
import shutil
import tempfile
import zipfile
from typing import Optional

import yaml
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document, Folder, Tag, document_tags
from app.imports.extractors import extract_pdf_text, extract_pptx_text, extract_youtube_transcript
from app.imports.converter import convert_to_notes
from app.rate_limit import limiter

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


@limiter.limit("10/minute")
@router.post("/upload", response_model=ExtractedContent)
async def upload_file(
    request: Request,
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


@limiter.limit("10/minute")
@router.post("/youtube", response_model=ExtractedContent)
async def import_youtube(
    request: Request,
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


@limiter.limit("10/minute")
@router.post("/convert", response_model=ConvertResponse)
async def convert(
    request: Request,
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


class ImportResult(BaseModel):
    imported: int
    folder_id: Optional[int] = None
    folder_name: Optional[str] = None
    notes: list[dict] = []


def _clean_notion_filename(filename: str) -> str:
    """Strip Notion UUIDs from filenames: 'My Note abc123def.md' → 'My Note'"""
    name = filename.rsplit(".", 1)[0] if "." in filename else filename
    # Notion appends a space + 32-char hex UUID
    cleaned = re.sub(r"\s+[a-f0-9]{32}$", "", name)
    return cleaned.strip() or name


def _convert_notion_content(content: str) -> str:
    """Convert Notion-specific markdown to standard format."""
    # Convert Notion callouts (> 💡 or > ⚠️) to standard blockquotes
    content = re.sub(r"^(>\s*)[💡⚠️📌🔥✅❌📝🎯]\s*", r"\1", content, flags=re.MULTILINE)
    # Convert Notion internal links to wiki links
    content = re.sub(r"\[([^\]]+)\]\([^)]*notion\.so[^)]*\)", r"[[\1]]", content)
    return content


def _convert_obsidian_content(content: str) -> str:
    """Convert Obsidian-specific markdown to standard format."""
    # Convert image embeds ![[image.png]] → ![](image.png)
    content = re.sub(r"!\[\[([^|\]]+\.(png|jpg|jpeg|gif|svg|webp))(\|[^\]]*)?\]\]", r"![](\1)", content, flags=re.IGNORECASE)
    # Convert non-image embeds ![[Note]] → [[Note]]
    content = re.sub(r"!\[\[([^\]]+)\]\]", r"[[\1]]", content)
    # Convert callouts > [!note], > [!warning] etc to blockquotes
    content = re.sub(r"^(>\s*)\[!(note|warning|info|tip|important|caution|example|quote|abstract|summary|todo|bug|danger|failure|success|question|faq)\]\s*", r"\1", content, flags=re.MULTILINE | re.IGNORECASE)
    return content


def _parse_obsidian_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter from Obsidian markdown. Returns (metadata, body)."""
    if not content.startswith("---"):
        return {}, content

    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content

    try:
        metadata = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        metadata = {}

    body = parts[2].lstrip("\n")
    return metadata, body


def _copy_media_file(src_path: str, filename: str) -> str:
    """Copy a media file to the media directory and return the relative URL."""
    media_dir = os.path.join("media", "imports")
    os.makedirs(media_dir, exist_ok=True)
    dest = os.path.join(media_dir, filename)
    # Avoid name collisions
    if os.path.exists(dest):
        base, ext = os.path.splitext(filename)
        import uuid as _uuid
        dest = os.path.join(media_dir, f"{base}_{_uuid.uuid4().hex[:8]}{ext}")
    shutil.copy2(src_path, dest)
    return f"/{dest}"


@limiter.limit("10/minute")
@router.post("/notion", response_model=ImportResult)
async def import_notion(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import notes from a Notion export (zip of markdown files)."""
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large (max 50MB)")

    filename = file.filename or "notion.zip"
    if not filename.endswith(".zip"):
        raise HTTPException(400, "Please upload a .zip file")

    tmp_dir = tempfile.mkdtemp()
    try:
        zip_path = os.path.join(tmp_dir, "upload.zip")
        with open(zip_path, "wb") as f:
            f.write(content)

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(tmp_dir)
        except zipfile.BadZipFile:
            raise HTTPException(400, "Invalid zip file")

        # Create root folder for import
        folder_name = _clean_notion_filename(filename.rsplit(".", 1)[0])
        root_folder = Folder(name=folder_name, user_id=current_user.id)
        db.add(root_folder)
        await db.flush()

        # Walk and find all .md files
        created_notes = []
        folder_cache: dict[str, int] = {}

        for dirpath, dirnames, filenames_list in os.walk(tmp_dir):
            for fname in sorted(filenames_list):
                if not fname.endswith(".md"):
                    continue

                filepath = os.path.join(dirpath, fname)
                rel_dir = os.path.relpath(dirpath, tmp_dir)

                # Determine folder_id
                folder_id = root_folder.id
                if rel_dir != ".":
                    clean_dir = _clean_notion_filename(rel_dir.split(os.sep)[-1])
                    if clean_dir and clean_dir not in folder_cache:
                        sub = Folder(name=clean_dir, user_id=current_user.id, parent_id=root_folder.id)
                        db.add(sub)
                        await db.flush()
                        folder_cache[clean_dir] = sub.id
                    if clean_dir:
                        folder_id = folder_cache[clean_dir]

                title = _clean_notion_filename(fname)

                try:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as mf:
                        md_content = mf.read()
                except Exception:
                    continue

                md_content = _convert_notion_content(md_content)

                # Handle images
                for img_match in re.finditer(r"!\[([^\]]*)\]\(([^)]+)\)", md_content):
                    img_path = img_match.group(2)
                    if img_path.startswith("http"):
                        continue
                    abs_img = os.path.normpath(os.path.join(dirpath, img_path))
                    if os.path.exists(abs_img):
                        img_name = os.path.basename(abs_img)
                        new_url = _copy_media_file(abs_img, img_name)
                        md_content = md_content.replace(img_match.group(2), new_url)

                doc = Document(
                    title=title,
                    content=md_content,
                    user_id=current_user.id,
                    folder_id=folder_id,
                )
                db.add(doc)
                await db.flush()
                created_notes.append({"id": doc.id, "title": title})

        await db.commit()

        return ImportResult(
            imported=len(created_notes),
            folder_id=root_folder.id,
            folder_name=folder_name,
            notes=created_notes,
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@limiter.limit("10/minute")
@router.post("/obsidian", response_model=ImportResult)
async def import_obsidian(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import notes from an Obsidian vault export (zip)."""
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large (max 50MB)")

    filename = file.filename or "obsidian.zip"
    if not filename.endswith(".zip"):
        raise HTTPException(400, "Please upload a .zip file")

    tmp_dir = tempfile.mkdtemp()
    try:
        zip_path = os.path.join(tmp_dir, "upload.zip")
        with open(zip_path, "wb") as f:
            f.write(content)

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(tmp_dir)
        except zipfile.BadZipFile:
            raise HTTPException(400, "Invalid zip file")

        # Create root folder
        vault_name = filename.rsplit(".", 1)[0]
        root_folder = Folder(name=vault_name, user_id=current_user.id)
        db.add(root_folder)
        await db.flush()

        created_notes = []
        folder_cache: dict[str, int] = {}

        for dirpath, dirnames, filenames_list in os.walk(tmp_dir):
            # Skip hidden/config dirs
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]

            for fname in sorted(filenames_list):
                if not fname.endswith(".md"):
                    continue

                filepath = os.path.join(dirpath, fname)
                rel_dir = os.path.relpath(dirpath, tmp_dir)

                # Determine folder_id
                folder_id = root_folder.id
                if rel_dir != ".":
                    dir_name = rel_dir.split(os.sep)[-1]
                    if dir_name and dir_name not in folder_cache:
                        sub = Folder(name=dir_name, user_id=current_user.id, parent_id=root_folder.id)
                        db.add(sub)
                        await db.flush()
                        folder_cache[dir_name] = sub.id
                    if dir_name:
                        folder_id = folder_cache[dir_name]

                try:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as mf:
                        md_content = mf.read()
                except Exception:
                    continue

                # Parse frontmatter
                metadata, md_content = _parse_obsidian_frontmatter(md_content)
                title = metadata.get("title") or fname.rsplit(".", 1)[0]
                frontmatter_tags = metadata.get("tags", [])
                if isinstance(frontmatter_tags, str):
                    frontmatter_tags = [t.strip() for t in frontmatter_tags.split(",") if t.strip()]

                # Convert Obsidian-specific content
                md_content = _convert_obsidian_content(md_content)

                # Handle image embeds that were converted to ![](path)
                for img_match in re.finditer(r"!\[([^\]]*)\]\(([^)]+)\)", md_content):
                    img_path = img_match.group(2)
                    if img_path.startswith("http"):
                        continue
                    abs_img = os.path.normpath(os.path.join(dirpath, img_path))
                    if os.path.exists(abs_img):
                        img_name = os.path.basename(abs_img)
                        new_url = _copy_media_file(abs_img, img_name)
                        md_content = md_content.replace(img_match.group(2), new_url)

                doc = Document(
                    title=title,
                    content=md_content,
                    user_id=current_user.id,
                    folder_id=folder_id,
                )
                db.add(doc)
                await db.flush()

                # Create tags from frontmatter
                if frontmatter_tags:
                    from sqlalchemy import select as sa_select, insert
                    for tag_name in frontmatter_tags[:20]:
                        tag_name = str(tag_name).strip()[:100]
                        if not tag_name:
                            continue
                        result = await db.execute(
                            sa_select(Tag).where(Tag.name == tag_name, Tag.user_id == current_user.id)
                        )
                        tag = result.scalar_one_or_none()
                        if not tag:
                            tag = Tag(name=tag_name, user_id=current_user.id)
                            db.add(tag)
                            await db.flush()
                        await db.execute(
                            insert(document_tags).values(document_id=doc.id, tag_id=tag.id).prefix_with("OR IGNORE")
                        )

                created_notes.append({"id": doc.id, "title": title})

        await db.commit()

        return ImportResult(
            imported=len(created_notes),
            folder_id=root_folder.id,
            folder_name=vault_name,
            notes=created_notes,
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
