import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.notes.models import Document
from app.quizzes.models import Quiz, QuizQuestion, QuizAttempt, QuizAnswer
from app.quizzes.schemas import (
    QuizGenerateRequest,
    QuestionResponse,
    QuizResponse,
    QuizDetailResponse,
    QuizSubmitRequest,
    AnswerResult,
    QuizAttemptResponse,
    QuizAttemptListResponse,
    QuizStatsResponse,
)
from app.crypto import decrypt_api_key
from app.llm.service import evaluate_text
from app.llm.context import get_learner_context, inject_learner_context
from app.llm.response_parser import parse_llm_json
from app.rate_limit import limiter
from app.automations.engine import fire_event

router = APIRouter()


@limiter.limit("10/minute")
@router.post("/generate", response_model=QuizDetailResponse)
async def generate_quiz(
    request: Request,
    body: QuizGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Fetch the note
    result = await db.execute(
        select(Document).where(
            Document.id == body.note_id,
            Document.user_id == current_user.id,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    types_str = ", ".join(body.question_types)
    prompt = (
        f"Generate exactly {body.count} quiz questions from the following study material.\n"
        f"Use these question types: {types_str}. Distribute types roughly evenly.\n\n"
        "Return ONLY a JSON array. No markdown, no explanation.\n"
        "Each object must have:\n"
        '- "question_type": "multiple_choice" | "true_false" | "fill_blank"\n'
        '- "question_text": the question\n'
        '- "options": array of 4 strings for MC, ["True", "False"] for TF, [] for fill_blank\n'
        '- "correct_answer": must exactly match one option (or the fill-in answer)\n'
        '- "explanation": 1-2 sentence explanation\n\n'
        f"Study material:\n{note.content}"
    )

    api_key = None
    if current_user.encrypted_anthropic_key:
        try:
            api_key = decrypt_api_key(current_user.encrypted_anthropic_key)
        except Exception:
            pass

    learner_ctx = await get_learner_context(db, current_user)
    from app.llm.prompts import VOICE
    system = inject_learner_context(VOICE, learner_ctx)

    raw_response = await evaluate_text(prompt, system_prompt=system, api_key=api_key)

    try:
        questions_data = parse_llm_json(raw_response)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Failed to parse quiz questions from AI response",
        )

    if not isinstance(questions_data, list):
        raise HTTPException(
            status_code=500,
            detail="AI response was not a JSON array",
        )

    # Filter to valid items
    questions_data = [
        item for item in questions_data
        if isinstance(item, dict)
        and "question_type" in item
        and "question_text" in item
        and "correct_answer" in item
    ]

    if not questions_data:
        raise HTTPException(
            status_code=500,
            detail="AI did not generate any valid questions",
        )

    # Create quiz
    title = f"Quiz: {note.title or 'Untitled'}"
    quiz = Quiz(
        title=title,
        user_id=current_user.id,
        note_id=body.note_id,
        question_count=len(questions_data),
    )
    db.add(quiz)
    await db.flush()

    # Create questions
    created_questions = []
    for i, item in enumerate(questions_data):
        options = item.get("options", [])
        if not isinstance(options, list):
            options = []
        question = QuizQuestion(
            quiz_id=quiz.id,
            question_type=item["question_type"],
            question_text=item["question_text"],
            options=json.dumps(options),
            correct_answer=item["correct_answer"],
            explanation=item.get("explanation", ""),
            order_index=i,
        )
        db.add(question)
        created_questions.append(question)

    await db.commit()
    await db.refresh(quiz)
    for q in created_questions:
        await db.refresh(q)

    return QuizDetailResponse(
        id=quiz.id,
        title=quiz.title,
        note_id=quiz.note_id,
        question_count=quiz.question_count,
        created_at=quiz.created_at,
        questions=[QuestionResponse.model_validate(q) for q in created_questions],
    )


@router.get("", response_model=list[QuizResponse])
async def list_quizzes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quiz)
        .where(Quiz.user_id == current_user.id)
        .order_by(Quiz.created_at.desc())
    )
    return result.scalars().all()


@router.get("/stats", response_model=QuizStatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Total quizzes
    result = await db.execute(
        select(sa_func.count(Quiz.id)).where(Quiz.user_id == current_user.id)
    )
    total_quizzes = result.scalar() or 0

    # Total attempts
    result = await db.execute(
        select(sa_func.count(QuizAttempt.id)).where(QuizAttempt.user_id == current_user.id)
    )
    total_attempts = result.scalar() or 0

    # Average and best score (as percentage)
    average_score = 0.0
    best_score = 0.0
    if total_attempts > 0:
        result = await db.execute(
            select(QuizAttempt.score, QuizAttempt.total_questions)
            .where(QuizAttempt.user_id == current_user.id)
        )
        attempts = result.all()
        percentages = [
            (a.score / a.total_questions * 100) if a.total_questions > 0 else 0
            for a in attempts
        ]
        average_score = round(sum(percentages) / len(percentages), 1)
        best_score = round(max(percentages), 1)

    return QuizStatsResponse(
        total_quizzes=total_quizzes,
        total_attempts=total_attempts,
        average_score=average_score,
        best_score=best_score,
    )


@router.get("/attempts", response_model=list[QuizAttemptListResponse])
async def list_attempts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(QuizAttempt, Quiz.title)
        .join(Quiz, QuizAttempt.quiz_id == Quiz.id)
        .where(QuizAttempt.user_id == current_user.id)
        .order_by(QuizAttempt.completed_at.desc())
    )
    rows = result.all()
    return [
        QuizAttemptListResponse(
            id=attempt.id,
            quiz_id=attempt.quiz_id,
            quiz_title=quiz_title,
            score=attempt.score,
            total_questions=attempt.total_questions,
            time_seconds=attempt.time_seconds,
            completed_at=attempt.completed_at,
        )
        for attempt, quiz_title in rows
    ]


@router.get("/attempts/{attempt_id}", response_model=QuizAttemptResponse)
async def get_attempt(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.id == attempt_id,
            QuizAttempt.user_id == current_user.id,
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Get answers with question data
    result = await db.execute(
        select(QuizAnswer, QuizQuestion)
        .join(QuizQuestion, QuizAnswer.question_id == QuizQuestion.id)
        .where(QuizAnswer.attempt_id == attempt.id)
        .order_by(QuizQuestion.order_index)
    )
    rows = result.all()

    results = []
    for answer, question in rows:
        options = []
        try:
            options = json.loads(question.options)
        except (json.JSONDecodeError, TypeError):
            pass
        results.append(AnswerResult(
            question_id=question.id,
            question_text=question.question_text,
            question_type=question.question_type,
            options=options,
            user_answer=answer.user_answer,
            correct_answer=question.correct_answer,
            is_correct=answer.is_correct,
            explanation=question.explanation,
        ))

    return QuizAttemptResponse(
        id=attempt.id,
        quiz_id=attempt.quiz_id,
        score=attempt.score,
        total_questions=attempt.total_questions,
        time_seconds=attempt.time_seconds,
        completed_at=attempt.completed_at,
        results=results,
    )


@router.get("/{quiz_id}", response_model=QuizDetailResponse)
async def get_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quiz).where(
            Quiz.id == quiz_id,
            Quiz.user_id == current_user.id,
        )
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    result = await db.execute(
        select(QuizQuestion)
        .where(QuizQuestion.quiz_id == quiz.id)
        .order_by(QuizQuestion.order_index)
    )
    questions = result.scalars().all()

    return QuizDetailResponse(
        id=quiz.id,
        title=quiz.title,
        note_id=quiz.note_id,
        question_count=quiz.question_count,
        created_at=quiz.created_at,
        questions=[QuestionResponse.model_validate(q) for q in questions],
    )


@router.post("/submit", response_model=QuizAttemptResponse)
async def submit_quiz(
    body: QuizSubmitRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify quiz exists and belongs to user
    result = await db.execute(
        select(Quiz).where(
            Quiz.id == body.quiz_id,
            Quiz.user_id == current_user.id,
        )
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Fetch all questions for this quiz
    result = await db.execute(
        select(QuizQuestion)
        .where(QuizQuestion.quiz_id == quiz.id)
        .order_by(QuizQuestion.order_index)
    )
    questions = {q.id: q for q in result.scalars().all()}

    # Grade answers
    score = 0
    answer_records = []
    results = []

    for ans in body.answers:
        question = questions.get(ans.question_id)
        if not question:
            continue

        # Grade based on question type (case-insensitive for all types)
        is_correct = ans.user_answer.strip().lower() == question.correct_answer.strip().lower()

        if is_correct:
            score += 1

        answer_records.append(QuizAnswer(
            question_id=question.id,
            user_answer=ans.user_answer,
            is_correct=is_correct,
        ))

        options = []
        try:
            options = json.loads(question.options)
        except (json.JSONDecodeError, TypeError):
            pass

        results.append(AnswerResult(
            question_id=question.id,
            question_text=question.question_text,
            question_type=question.question_type,
            options=options,
            user_answer=ans.user_answer,
            correct_answer=question.correct_answer,
            is_correct=is_correct,
            explanation=question.explanation,
        ))

    # Create attempt
    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=current_user.id,
        score=score,
        total_questions=len(questions),
        time_seconds=body.time_seconds,
    )
    db.add(attempt)
    await db.flush()

    # Save answer records
    for record in answer_records:
        record.attempt_id = attempt.id
        db.add(record)

    await db.commit()
    await db.refresh(attempt)

    # Fire webhook for quiz_complete
    async def _fire_quiz_webhook():
        from app.database import async_session
        from app.integrations.webhook import fire_webhooks_for_user
        async with async_session() as s:
            await fire_webhooks_for_user(
                current_user.id, "quiz_complete",
                {
                    "title": quiz.title,
                    "score": attempt.score,
                    "total": attempt.total_questions,
                    "quiz_id": quiz.id,
                }, s,
            )

    background_tasks.add_task(_fire_quiz_webhook)

    from app.social.activity import log_activity
    background_tasks.add_task(
        log_activity, current_user.id, "quiz_complete",
        {"title": quiz.title, "score": score, "total": len(questions), "quiz_id": quiz.id},
    )

    total = len(questions)
    background_tasks.add_task(fire_event, current_user.id, "quiz_completed", {
        "quiz_id": quiz.id, "title": quiz.title, "score": score, "total": total,
        "pct": round(score / total * 100, 1) if total > 0 else 0,
        "note_id": quiz.note_id,
    })

    if quiz.note_id:
        async def _update_review():
            from app.reviews.service import update_review_from_activity
            from app.database import async_session
            async with async_session() as s:
                quality = 4 if (total > 0 and score / total >= 0.7) else 2
                await update_review_from_activity(s, current_user.id, quiz.note_id, quality)
                await s.commit()
        background_tasks.add_task(_update_review)

    return QuizAttemptResponse(
        id=attempt.id,
        quiz_id=attempt.quiz_id,
        score=attempt.score,
        total_questions=attempt.total_questions,
        time_seconds=attempt.time_seconds,
        completed_at=attempt.completed_at,
        results=results,
    )


@router.delete("/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quiz).where(
            Quiz.id == quiz_id,
            Quiz.user_id == current_user.id,
        )
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    await db.delete(quiz)
    await db.commit()
