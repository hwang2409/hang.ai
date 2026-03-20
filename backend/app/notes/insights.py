import hashlib
import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document, NoteAnalysis
from app.notes.schemas import DocumentResponse

logger = logging.getLogger(__name__)

router = APIRouter()


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


# ── Cheat Sheet Generation ─────────────────────────────────────────────────

@router.post("/{doc_id}/cheatsheet")
async def generate_cheatsheet(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a concise cheat sheet / reference card from note content."""
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

    if not doc.content or len(doc.content.strip()) < 50:
        raise HTTPException(status_code=400, detail="Note has insufficient content for a cheat sheet")

    from app.llm.service import evaluate_text
    from app.llm.response_parser import parse_llm_json

    prompt = f"""Create a concise, exam-ready cheat sheet from the following study material.

Title: {doc.title or 'Untitled'}

Content:
{doc.content[:6000]}

Return ONLY a JSON object with these fields:
- "title": string — cheat sheet title
- "sections": array of {{ "heading": string, "points": [string] }} — organized key points (max 6 sections, max 8 points each)
- "key_facts": array of strings — essential facts to memorize (max 10)
- "formulas": array of {{ "latex": string, "description": string }} — key formulas if applicable (max 8)
- "mnemonics": array of strings — memory aids or tricks (max 5)
- "common_mistakes": array of strings — common errors to avoid (max 5)

Keep each point brief (1-2 sentences max). Prioritize memorability and exam relevance. If a field has no items, use an empty array."""

    try:
        raw = await evaluate_text(prompt)
        cheatsheet = parse_llm_json(raw)
        for key in ("title", "sections", "key_facts", "formulas", "mnemonics", "common_mistakes"):
            if key not in cheatsheet:
                cheatsheet[key] = [] if key != "title" else (doc.title or "Cheat Sheet")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate cheat sheet")

    return cheatsheet


# ── Outline Generation ────────────────────────────────────────────────────

@router.post("/{doc_id}/outline")
async def generate_outline(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a structured outline from note content using LLM."""
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

    if not doc.content or len(doc.content.strip()) < 50:
        raise HTTPException(status_code=400, detail="Note has insufficient content for an outline")

    from app.llm.service import evaluate_text
    from app.llm.response_parser import parse_llm_json

    prompt = f"""Create a structured outline from the following study material. Extract the key hierarchy of ideas.

Title: {doc.title or 'Untitled'}

Content:
{doc.content[:6000]}

Return ONLY a JSON object with these fields:
- "title": string — outline title
- "items": array of outline items, where each item has:
  - "text": string — the outline point
  - "level": integer — nesting level (1 = top level, 2 = sub-point, 3 = sub-sub-point)
  - "children": array of child items (same structure, recursive) — optional, can be empty array

Keep the outline concise and well-organized. Maximum 4 levels of depth. Focus on the logical structure and flow of ideas."""

    try:
        raw = await evaluate_text(prompt)
        outline = parse_llm_json(raw)
        if "title" not in outline:
            outline["title"] = doc.title or "Outline"
        if "items" not in outline:
            outline["items"] = []
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate outline")

    return outline


# ── Compile Study Guide ───────────────────────────────────────────────────

@router.post("/compile-study-guide", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def compile_study_guide(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compile multiple notes into a single study guide using AI."""
    note_ids = body.get("note_ids", [])
    if len(note_ids) < 2:
        raise HTTPException(status_code=400, detail="Select at least 2 notes")
    if len(note_ids) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 notes at a time")

    result = await db.execute(
        select(Document).where(
            Document.id.in_(note_ids),
            Document.user_id == current_user.id,
            Document.deleted == False,
        )
    )
    notes = result.scalars().all()
    if len(notes) < 2:
        raise HTTPException(status_code=404, detail="Not enough valid notes found")

    # Concatenate note contents
    sections = []
    titles = []
    for note in notes:
        title = note.title or "Untitled"
        titles.append(title)
        content = note.content or ""
        sections.append(f"## Source: {title}\n\n{content}")

    combined = "\n\n---\n\n".join(sections)

    # Truncate if too long (keep ~15k chars for prompt)
    if len(combined) > 15000:
        combined = combined[:15000] + "\n\n[... content truncated for length]"

    from app.llm.service import evaluate_text

    prompt = (
        "Compile and synthesize the following notes into a single, well-organized study guide.\n\n"
        "Requirements:\n"
        "- Merge overlapping concepts, eliminate redundancy\n"
        "- Organize by topic with clear headings\n"
        "- Include key definitions, formulas, and important facts\n"
        "- Add a summary section at the top\n"
        "- Use markdown formatting\n"
        "- Preserve important details — don't oversimplify\n\n"
        f"Source notes:\n\n{combined}\n\n"
        "Generate the compiled study guide in markdown format. "
        "Start directly with the content, no preamble."
    )

    guide_content = await evaluate_text(prompt)

    guide_title = body.get("title") or f"Study Guide — {', '.join(titles[:3])}"
    if len(titles) > 3:
        guide_title += f" +{len(titles) - 3} more"

    doc = Document(
        title=guide_title,
        content=guide_content,
        type="text",
        user_id=current_user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc
