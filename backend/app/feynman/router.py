import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document
from app.feynman.models import FeynmanSession
from app.feynman.schemas import SessionCreate, SessionResponse, SessionListResponse
from app.llm.service import evaluate_text
from app.llm.response_parser import parse_llm_json

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
