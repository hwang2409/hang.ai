import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document
from app.feynman.models import FeynmanSession, SocraticSession
from app.feynman.schemas import (
    SessionCreate, SessionResponse, SessionListResponse,
    SocraticStartRequest, SocraticReplyRequest,
    SocraticSessionResponse, SocraticSessionListResponse,
)
from app.llm.service import evaluate_text
from app.llm.response_parser import parse_llm_json

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Optionally fetch reference note
    note_content = ""
    if body.note_id:
        result = await db.execute(
            select(Document).where(
                Document.id == body.note_id,
                Document.user_id == current_user.id,
            )
        )
        note = result.scalar_one_or_none()
        if note:
            note_content = note.content

    # Build prompt
    reference_section = ""
    if note_content:
        reference_section = f"\nReference material:\n{note_content}\n"

    prompt = (
        "You are evaluating a student's explanation using the Feynman Technique.\n\n"
        f"Topic: {body.topic}\n\n"
        f"Student's explanation:\n{body.explanation}\n"
        f"{reference_section}\n"
        "Evaluate the explanation and return ONLY a JSON object with these fields:\n"
        '- "score": integer 0-100 (how well they explained the concept)\n'
        '- "strengths": array of strings (what they did well)\n'
        '- "weaknesses": array of strings (what they missed or got wrong)\n'
        '- "feedback": string (constructive advice for improvement)'
    )

    raw_response = await evaluate_text(prompt)

    try:
        evaluation = parse_llm_json(raw_response)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Failed to parse evaluation from AI response",
        )

    session = FeynmanSession(
        topic=body.topic,
        explanation=body.explanation,
        score=evaluation.get("score", 0),
        strengths=json.dumps(evaluation.get("strengths", [])),
        weaknesses=json.dumps(evaluation.get("weaknesses", [])),
        feedback=evaluation.get("feedback", ""),
        user_id=current_user.id,
        note_id=body.note_id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/sessions", response_model=list[SessionListResponse])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FeynmanSession)
        .where(FeynmanSession.user_id == current_user.id)
        .order_by(FeynmanSession.created_at.desc())
    )
    return result.scalars().all()


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FeynmanSession).where(
            FeynmanSession.id == session_id,
            FeynmanSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FeynmanSession).where(
            FeynmanSession.id == session_id,
            FeynmanSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.delete(session)
    await db.commit()


# ---------------------------------------------------------------------------
# Socratic dialogue endpoints
# ---------------------------------------------------------------------------

SOCRATIC_SYSTEM = (
    "You are a Socratic tutor on the Hang.ai learning platform. "
    "Your job is to probe the student's understanding of a topic through focused questions. "
    "Ask one question at a time. Adapt your questions based on the student's answers — "
    "probe deeper where they seem uncertain, and move to new aspects when they demonstrate mastery. "
    "Be encouraging but rigorous."
)

MIN_QUESTIONS_BEFORE_AUTO_EVAL = 5
MAX_QUESTIONS = 10


def _build_socratic_prompt(
    topic: str,
    messages: list[dict],
    note_content: str,
    force_evaluate: bool = False,
) -> str:
    question_count = sum(1 for m in messages if m["role"] == "ai")

    conversation = ""
    for m in messages:
        role_label = "Tutor" if m["role"] == "ai" else "Student"
        conversation += f"{role_label}: {m['content']}\n"

    reference_section = ""
    if note_content:
        reference_section = f"\nReference material on this topic:\n{note_content}\n"

    if force_evaluate or question_count >= MAX_QUESTIONS:
        return (
            f"Topic: {topic}\n{reference_section}\n"
            f"Conversation so far:\n{conversation}\n"
            "The dialogue is now complete. Evaluate the student's understanding based on their answers.\n\n"
            "Return ONLY a JSON object with these fields:\n"
            '- "type": "evaluation"\n'
            '- "score": integer 0-100\n'
            '- "strengths": array of strings\n'
            '- "weaknesses": array of strings\n'
            '- "feedback": string (constructive advice)\n'
        )

    can_evaluate = question_count >= MIN_QUESTIONS_BEFORE_AUTO_EVAL

    eval_instruction = ""
    if can_evaluate:
        eval_instruction = (
            f"\nYou have asked {question_count} questions. If you feel you have enough information "
            "to evaluate the student's understanding, you may end the dialogue.\n"
            'To end: return a JSON object with "type": "evaluation", "score": 0-100, '
            '"strengths": [...], "weaknesses": [...], "feedback": "...".\n'
        )

    return (
        f"Topic: {topic}\n{reference_section}\n"
        f"Conversation so far:\n{conversation}\n"
        f"{eval_instruction}"
        "To continue: return a JSON object with "
        '"type": "question", "content": "<your next probing question>".\n\n'
        "Return ONLY the JSON object, no other text."
    )


async def _get_note_content(db: AsyncSession, note_id: int | None, user_id: int) -> str:
    if not note_id:
        return ""
    result = await db.execute(
        select(Document).where(Document.id == note_id, Document.user_id == user_id)
    )
    note = result.scalar_one_or_none()
    return note.content if note else ""


def _parse_ai_response(raw: str) -> dict:
    """Parse AI response, handling both JSON and plain text."""
    try:
        return parse_llm_json(raw)
    except (json.JSONDecodeError, Exception):
        # If AI returned plain text instead of JSON, treat as a question
        return {"type": "question", "content": raw.strip()}


@router.post("/socratic", response_model=SocraticSessionResponse, status_code=status.HTTP_201_CREATED)
async def start_socratic_session(
    body: SocraticStartRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note_content = await _get_note_content(db, body.note_id, current_user.id)

    # AI generates the first question
    reference_section = f"\nReference material:\n{note_content}\n" if note_content else ""
    first_prompt = (
        f"Topic: {body.topic}\n{reference_section}\n"
        "Begin a Socratic dialogue to test the student's understanding of this topic. "
        "Ask your first probing question.\n\n"
        'Return ONLY a JSON object: {"type": "question", "content": "<your question>"}'
    )

    raw = await evaluate_text(first_prompt, system_prompt=SOCRATIC_SYSTEM)
    parsed = _parse_ai_response(raw)
    question_text = parsed.get("content", raw.strip())

    messages = [{"role": "ai", "content": question_text}]

    session = SocraticSession(
        topic=body.topic,
        messages=json.dumps(messages),
        status="active",
        question_count=1,
        user_id=current_user.id,
        note_id=body.note_id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.post("/socratic/{session_id}/reply", response_model=SocraticSessionResponse)
async def reply_socratic(
    session_id: int,
    body: SocraticReplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SocraticSession).where(
            SocraticSession.id == session_id,
            SocraticSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session already completed")

    messages = json.loads(session.messages)
    messages.append({"role": "user", "content": body.message})

    note_content = await _get_note_content(db, session.note_id, current_user.id)
    prompt = _build_socratic_prompt(session.topic, messages, note_content)
    raw = await evaluate_text(prompt, system_prompt=SOCRATIC_SYSTEM)
    parsed = _parse_ai_response(raw)

    if parsed.get("type") == "evaluation":
        # AI decided to evaluate
        messages.append({"role": "ai", "content": f"Thank you for the discussion! Here's my evaluation."})
        session.messages = json.dumps(messages)
        session.status = "completed"
        session.score = parsed.get("score", 0)
        session.strengths = json.dumps(parsed.get("strengths", []))
        session.weaknesses = json.dumps(parsed.get("weaknesses", []))
        session.feedback = parsed.get("feedback", "")
    else:
        # AI asks another question
        question_text = parsed.get("content", raw.strip())
        messages.append({"role": "ai", "content": question_text})
        session.messages = json.dumps(messages)
        session.question_count += 1

    await db.commit()
    await db.refresh(session)
    return session


@router.post("/socratic/{session_id}/finish", response_model=SocraticSessionResponse)
async def finish_socratic(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SocraticSession).where(
            SocraticSession.id == session_id,
            SocraticSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session already completed")

    messages = json.loads(session.messages)
    note_content = await _get_note_content(db, session.note_id, current_user.id)
    prompt = _build_socratic_prompt(session.topic, messages, note_content, force_evaluate=True)
    raw = await evaluate_text(prompt, system_prompt=SOCRATIC_SYSTEM)
    parsed = _parse_ai_response(raw)

    # Force evaluation even if AI returned a question
    if parsed.get("type") != "evaluation":
        # Retry with explicit instruction
        raw = await evaluate_text(
            prompt + "\n\nYou MUST evaluate now. Return the evaluation JSON.",
            system_prompt=SOCRATIC_SYSTEM,
        )
        parsed = _parse_ai_response(raw)

    session.messages = json.dumps(messages)
    session.status = "completed"
    session.score = parsed.get("score", 0)
    session.strengths = json.dumps(parsed.get("strengths", []))
    session.weaknesses = json.dumps(parsed.get("weaknesses", []))
    session.feedback = parsed.get("feedback", "")

    await db.commit()
    await db.refresh(session)
    return session


@router.get("/socratic", response_model=list[SocraticSessionListResponse])
async def list_socratic_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SocraticSession)
        .where(SocraticSession.user_id == current_user.id)
        .order_by(SocraticSession.created_at.desc())
    )
    return result.scalars().all()


@router.get("/socratic/{session_id}", response_model=SocraticSessionResponse)
async def get_socratic_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SocraticSession).where(
            SocraticSession.id == session_id,
            SocraticSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/socratic/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_socratic_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SocraticSession).where(
            SocraticSession.id == session_id,
            SocraticSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
