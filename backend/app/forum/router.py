import asyncio
import hashlib
import json
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select, func as sa_func, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.database import async_session
from app.llm.service import ApiKeyRequiredError
from app.search.service import embed_text, cosine_similarity
from app.search.models import NoteEmbedding
from app.notes.models import Document
from app.notifications.helpers import create_notification
from app.forum.models import (
    ForumAnswer,
    ForumBookmark,
    ForumComment,
    ForumQuestion,
    ForumQuestionEmbedding,
    ForumVote,
)
from app.forum.schemas import (
    AnswerCreate,
    AnswerResponse,
    BountyRequest,
    CloseQuestionRequest,
    CommentCreate,
    CommentResponse,
    FindSimilarRequest,
    FindSimilarResponse,
    QuestionCreate,
    QuestionDetail,
    QuestionSummary,
    QuestionUpdate,
    RelatedNote,
    SimilarQuestion,
    TagCount,
    VoteRequest,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _adjust_rep(user: User, delta: int):
    user.reputation = max(getattr(user, 'reputation', 1) + delta, 1)


async def _get_user_rep(db: AsyncSession, user_id: int) -> int:
    result = await db.execute(select(User.reputation).where(User.id == user_id))
    return result.scalar() or 1


async def _embed_question_background(question_id: int, title: str, body: str):
    text = f"{title}\n{body}"[:2000]
    content_hash = hashlib.sha256(text.encode()).hexdigest()
    vec = await embed_text(text)
    vec_json = json.dumps(vec)
    async with async_session() as db:
        result = await db.execute(
            select(ForumQuestionEmbedding).where(
                ForumQuestionEmbedding.question_id == question_id
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.embedding = vec_json
            existing.content_hash = content_hash
        else:
            db.add(
                ForumQuestionEmbedding(
                    question_id=question_id,
                    embedding=vec_json,
                    content_hash=content_hash,
                )
            )
        await db.commit()


async def _get_similar_questions(
    db: AsyncSession, query_vec: list[float], exclude_id: int | None = None
) -> list[SimilarQuestion]:
    result = await db.execute(
        select(ForumQuestionEmbedding, ForumQuestion.title, ForumQuestion.id)
        .join(ForumQuestion, ForumQuestionEmbedding.question_id == ForumQuestion.id)
    )
    rows = result.all()
    scored: list[SimilarQuestion] = []
    for emb, title, qid in rows:
        if exclude_id is not None and qid == exclude_id:
            continue
        doc_vec = json.loads(emb.embedding)
        sim = cosine_similarity(query_vec, doc_vec)
        if sim >= 0.5:
            scored.append(SimilarQuestion(id=qid, title=title, score=round(sim, 4)))
    scored.sort(key=lambda x: x.score, reverse=True)
    return scored[:5]


async def _get_related_notes(
    db: AsyncSession, query_vec: list[float], user_id: int
) -> list[RelatedNote]:
    result = await db.execute(
        select(NoteEmbedding, Document.title, Document.id)
        .join(Document, NoteEmbedding.document_id == Document.id)
        .where(
            Document.user_id == user_id,
            Document.deleted == False,  # noqa: E712
        )
    )
    rows = result.all()
    scored: list[RelatedNote] = []
    for emb, title, doc_id in rows:
        doc_vec = json.loads(emb.embedding)
        sim = cosine_similarity(query_vec, doc_vec)
        if sim >= 0.5:
            scored.append(RelatedNote(id=doc_id, title=title or "Untitled", score=round(sim, 4)))
    scored.sort(key=lambda x: x.score, reverse=True)
    return scored[:5]


async def _check_bookmarked(db: AsyncSession, user_id: int, question_ids: list[int]) -> set[int]:
    if not question_ids:
        return set()
    result = await db.execute(
        select(ForumBookmark.question_id).where(
            ForumBookmark.user_id == user_id,
            ForumBookmark.question_id.in_(question_ids),
        )
    )
    return {r[0] for r in result.all()}


# ── Questions ─────────────────────────────────────────────────────────────────


@router.get("/questions", response_model=list[QuestionSummary])
async def list_questions(
    sort: str = Query("newest", pattern="^(newest|votes|unanswered|hot)$"),
    tag: str | None = Query(None),
    q: str | None = Query(None),
    saved: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(ForumQuestion, User.username, User.reputation)
        .join(User, ForumQuestion.user_id == User.id)
    )

    if saved:
        stmt = stmt.join(
            ForumBookmark,
            (ForumBookmark.question_id == ForumQuestion.id) & (ForumBookmark.user_id == current_user.id),
        )

    if tag:
        stmt = stmt.where(ForumQuestion.tags.contains(tag))

    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                ForumQuestion.title.ilike(pattern),
                ForumQuestion.body.ilike(pattern),
            )
        )

    if sort == "newest":
        stmt = stmt.order_by(ForumQuestion.created_at.desc())
    elif sort == "votes":
        stmt = stmt.order_by((ForumQuestion.upvote_count - ForumQuestion.downvote_count).desc())
    elif sort == "unanswered":
        stmt = stmt.where(ForumQuestion.is_answered == False)  # noqa: E712
        stmt = stmt.order_by(ForumQuestion.created_at.desc())
    elif sort == "hot":
        # Hot sort: fetch recent questions and sort in Python
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        stmt = stmt.where(ForumQuestion.created_at >= week_ago)

    if sort != "hot":
        stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()

    if sort == "hot":
        now = datetime.now(timezone.utc)
        def hot_score(q_obj):
            created = q_obj.created_at
            if created and created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            age_hours = max((now - created).total_seconds() / 3600, 0) if created else 0
            votes = q_obj.upvote_count - q_obj.downvote_count
            return (votes + 1) / ((age_hours + 2) ** 1.5)
        rows = sorted(rows, key=lambda r: hot_score(r[0]), reverse=True)
        rows = rows[offset:offset + limit]

    question_ids = [q_obj.id for q_obj, _, _ in rows]
    bookmarked = await _check_bookmarked(db, current_user.id, question_ids)

    return [
        QuestionSummary(
            id=q_obj.id,
            title=q_obj.title,
            tags=[t.strip() for t in q_obj.tags.split(",") if t.strip()] if q_obj.tags else [],
            username=username,
            user_id=q_obj.user_id,
            reputation=rep or 1,
            upvote_count=q_obj.upvote_count,
            downvote_count=q_obj.downvote_count,
            score=q_obj.upvote_count - q_obj.downvote_count,
            answer_count=q_obj.answer_count,
            view_count=q_obj.view_count,
            is_answered=q_obj.is_answered,
            is_bookmarked=q_obj.id in bookmarked,
            status=getattr(q_obj, 'status', 'open') or 'open',
            duplicate_of_id=getattr(q_obj, 'duplicate_of_id', None),
            bounty=getattr(q_obj, 'bounty', 0) or 0,
            bounty_expires_at=getattr(q_obj, 'bounty_expires_at', None),
            created_at=q_obj.created_at,
        )
        for q_obj, username, rep in rows
    ]


@router.post("/questions", response_model=QuestionDetail, status_code=status.HTTP_201_CREATED)
async def create_question(
    body: QuestionCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tags_str = ",".join(body.tags) if body.tags else ""

    question = ForumQuestion(
        user_id=current_user.id,
        title=body.title,
        body=body.body,
        tags=tags_str,
        linked_note_id=body.linked_note_id,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)

    background_tasks.add_task(_embed_question_background, question.id, question.title, question.body)

    return QuestionDetail(
        id=question.id,
        title=question.title,
        body=question.body,
        tags=[t.strip() for t in question.tags.split(",") if t.strip()] if question.tags else [],
        username=current_user.username,
        user_id=question.user_id,
        reputation=getattr(current_user, 'reputation', 1) or 1,
        upvote_count=0,
        downvote_count=0,
        score=0,
        answer_count=question.answer_count,
        view_count=question.view_count,
        is_answered=question.is_answered,
        linked_note_id=question.linked_note_id,
        user_vote_direction=0,
        comments=[],
        answers=[],
        similar_questions=[],
        created_at=question.created_at,
        updated_at=question.updated_at,
    )


@router.get("/questions/{question_id}", response_model=QuestionDetail)
async def get_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Fetch question with username and reputation
    result = await db.execute(
        select(ForumQuestion, User.username, User.reputation)
        .join(User, ForumQuestion.user_id == User.id)
        .where(ForumQuestion.id == question_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Question not found")
    question, username, q_rep = row

    # Increment view count
    question.view_count += 1
    await db.commit()
    await db.refresh(question)

    # Fetch answers sorted: accepted first, then by votes, then by date
    ans_result = await db.execute(
        select(ForumAnswer, User.username, User.reputation)
        .join(User, ForumAnswer.user_id == User.id)
        .where(ForumAnswer.question_id == question_id)
        .order_by(
            ForumAnswer.is_accepted.desc(),
            ForumAnswer.upvote_count.desc(),
            ForumAnswer.created_at.asc(),
        )
    )
    answer_rows = ans_result.all()

    # Check if current user has voted on question (and get direction)
    vote_result = await db.execute(
        select(ForumVote).where(
            ForumVote.user_id == current_user.id,
            ForumVote.target_type == "question",
            ForumVote.target_id == question_id,
        )
    )
    question_vote = vote_result.scalar_one_or_none()
    user_vote_direction_question = question_vote.direction if question_vote else 0

    # Check user votes on all answers in one query (with direction)
    answer_ids = [a.id for a, _, _ in answer_rows]
    user_answer_vote_directions: dict[int, int] = {}
    if answer_ids:
        vote_result = await db.execute(
            select(ForumVote.target_id, ForumVote.direction).where(
                ForumVote.user_id == current_user.id,
                ForumVote.target_type == "answer",
                ForumVote.target_id.in_(answer_ids),
            )
        )
        user_answer_vote_directions = {r[0]: r[1] for r in vote_result.all()}

    # Fetch comments for the question
    q_comments_result = await db.execute(
        select(ForumComment, User.username)
        .join(User, ForumComment.user_id == User.id)
        .where(
            ForumComment.target_type == "question",
            ForumComment.target_id == question_id,
        )
        .order_by(ForumComment.created_at.asc())
    )
    question_comments = [
        CommentResponse(
            id=c.id,
            user_id=c.user_id,
            username=c_username,
            body=c.body,
            created_at=c.created_at,
        )
        for c, c_username in q_comments_result.all()
    ]

    # Fetch comments for all answers in one query
    answer_comments_map: dict[int, list[CommentResponse]] = {aid: [] for aid in answer_ids}
    if answer_ids:
        a_comments_result = await db.execute(
            select(ForumComment, User.username)
            .join(User, ForumComment.user_id == User.id)
            .where(
                ForumComment.target_type == "answer",
                ForumComment.target_id.in_(answer_ids),
            )
            .order_by(ForumComment.created_at.asc())
        )
        for c, c_username in a_comments_result.all():
            answer_comments_map[c.target_id].append(
                CommentResponse(
                    id=c.id,
                    user_id=c.user_id,
                    username=c_username,
                    body=c.body,
                    created_at=c.created_at,
                )
            )

    answers = [
        AnswerResponse(
            id=a.id,
            question_id=a.question_id,
            user_id=a.user_id,
            username=a_username,
            reputation=a_rep or 1,
            body=a.body,
            upvote_count=a.upvote_count,
            downvote_count=a.downvote_count,
            score=a.upvote_count - a.downvote_count,
            is_accepted=a.is_accepted,
            is_ai=a.is_ai,
            user_vote_direction=user_answer_vote_directions.get(a.id, 0),
            comments=answer_comments_map.get(a.id, []),
            created_at=a.created_at,
            updated_at=a.updated_at,
        )
        for a, a_username, a_rep in answer_rows
    ]

    # Similar questions via embedding
    similar_questions: list[SimilarQuestion] = []
    try:
        emb_result = await db.execute(
            select(ForumQuestionEmbedding).where(
                ForumQuestionEmbedding.question_id == question_id
            )
        )
        emb = emb_result.scalar_one_or_none()
        if emb:
            query_vec = json.loads(emb.embedding)
            similar_questions = await _get_similar_questions(db, query_vec, exclude_id=question_id)
    except Exception:
        pass  # Embedding may not exist yet

    # Check bookmark
    bookmarked = await _check_bookmarked(db, current_user.id, [question_id])

    return QuestionDetail(
        id=question.id,
        title=question.title,
        body=question.body,
        tags=[t.strip() for t in question.tags.split(",") if t.strip()] if question.tags else [],
        username=username,
        user_id=question.user_id,
        reputation=q_rep or 1,
        upvote_count=question.upvote_count,
        downvote_count=question.downvote_count,
        score=question.upvote_count - question.downvote_count,
        answer_count=question.answer_count,
        view_count=question.view_count,
        is_answered=question.is_answered,
        is_bookmarked=question.id in bookmarked,
        status=getattr(question, 'status', 'open') or 'open',
        duplicate_of_id=getattr(question, 'duplicate_of_id', None),
        bounty=getattr(question, 'bounty', 0) or 0,
        bounty_expires_at=getattr(question, 'bounty_expires_at', None),
        linked_note_id=question.linked_note_id,
        user_vote_direction=user_vote_direction_question,
        comments=question_comments,
        answers=answers,
        similar_questions=similar_questions,
        created_at=question.created_at,
        updated_at=question.updated_at,
    )


@router.put("/questions/{question_id}", response_model=QuestionDetail)
async def update_question(
    question_id: int,
    body: QuestionUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")

    if body.title is not None:
        question.title = body.title
    if body.body is not None:
        question.body = body.body
    if body.tags is not None:
        question.tags = ",".join(body.tags)

    await db.commit()
    await db.refresh(question)

    # Re-embed if title or body changed
    if body.title is not None or body.body is not None:
        background_tasks.add_task(_embed_question_background, question.id, question.title, question.body)

    return QuestionDetail(
        id=question.id,
        title=question.title,
        body=question.body,
        tags=[t.strip() for t in question.tags.split(",") if t.strip()] if question.tags else [],
        username=current_user.username,
        user_id=question.user_id,
        reputation=getattr(current_user, 'reputation', 1) or 1,
        upvote_count=question.upvote_count,
        downvote_count=question.downvote_count,
        score=question.upvote_count - question.downvote_count,
        answer_count=question.answer_count,
        view_count=question.view_count,
        is_answered=question.is_answered,
        status=getattr(question, 'status', 'open') or 'open',
        duplicate_of_id=getattr(question, 'duplicate_of_id', None),
        bounty=getattr(question, 'bounty', 0) or 0,
        bounty_expires_at=getattr(question, 'bounty_expires_at', None),
        linked_note_id=question.linked_note_id,
        user_vote_direction=0,
        comments=[],
        answers=[],
        similar_questions=[],
        created_at=question.created_at,
        updated_at=question.updated_at,
    )


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")

    await db.delete(question)
    await db.commit()


# ── Bookmarks ────────────────────────────────────────────────────────────────


@router.post("/questions/{question_id}/bookmark")
async def toggle_bookmark(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == question_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Question not found")

    result = await db.execute(
        select(ForumBookmark).where(
            ForumBookmark.user_id == current_user.id,
            ForumBookmark.question_id == question_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
        return {"bookmarked": False}
    else:
        db.add(ForumBookmark(user_id=current_user.id, question_id=question_id))
        await db.commit()
        return {"bookmarked": True}


@router.get("/bookmarks", response_model=list[QuestionSummary])
async def list_bookmarks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumQuestion, User.username, User.reputation)
        .join(User, ForumQuestion.user_id == User.id)
        .join(ForumBookmark, ForumBookmark.question_id == ForumQuestion.id)
        .where(ForumBookmark.user_id == current_user.id)
        .order_by(ForumQuestion.created_at.desc())
    )
    rows = result.all()

    return [
        QuestionSummary(
            id=q_obj.id,
            title=q_obj.title,
            tags=[t.strip() for t in q_obj.tags.split(",") if t.strip()] if q_obj.tags else [],
            username=username,
            user_id=q_obj.user_id,
            reputation=rep or 1,
            upvote_count=q_obj.upvote_count,
            downvote_count=q_obj.downvote_count,
            score=q_obj.upvote_count - q_obj.downvote_count,
            answer_count=q_obj.answer_count,
            view_count=q_obj.view_count,
            is_answered=q_obj.is_answered,
            is_bookmarked=True,
            status=getattr(q_obj, 'status', 'open') or 'open',
            bounty=getattr(q_obj, 'bounty', 0) or 0,
            created_at=q_obj.created_at,
        )
        for q_obj, username, rep in rows
    ]


# ── Question Status ──────────────────────────────────────────────────────────


@router.post("/questions/{question_id}/close")
async def close_question(
    question_id: int,
    body: CloseQuestionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    user_rep = getattr(current_user, 'reputation', 1) or 1
    if question.user_id != current_user.id and user_rep < 250:
        raise HTTPException(status_code=403, detail="Requires 250 reputation or be the author")

    question.status = body.status if body.status in ("closed", "duplicate") else "closed"
    if body.status == "duplicate" and body.duplicate_of_id:
        question.duplicate_of_id = body.duplicate_of_id
    await db.commit()
    return {"detail": "Question closed", "status": question.status}


@router.post("/questions/{question_id}/reopen")
async def reopen_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    user_rep = getattr(current_user, 'reputation', 1) or 1
    if question.user_id != current_user.id and user_rep < 250:
        raise HTTPException(status_code=403, detail="Requires 250 reputation or be the author")

    question.status = "open"
    question.duplicate_of_id = None
    await db.commit()
    return {"detail": "Question reopened"}


# ── Answers ───────────────────────────────────────────────────────────────────


@router.post(
    "/questions/{question_id}/answers",
    response_model=AnswerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_answer(
    question_id: int,
    body: AnswerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Reject answers on closed questions
    if getattr(question, 'status', 'open') in ('closed', 'duplicate'):
        raise HTTPException(status_code=400, detail="Cannot answer a closed question")

    answer = ForumAnswer(
        question_id=question_id,
        user_id=current_user.id,
        body=body.body,
    )
    db.add(answer)
    question.answer_count += 1

    # Notify question author
    if question.user_id != current_user.id:
        create_notification(
            db, question.user_id, "new_answer",
            f"{current_user.username} answered your question",
            body=question.title[:100],
            link=f"/forum/{question_id}",
        )

    await db.commit()
    await db.refresh(answer)

    return AnswerResponse(
        id=answer.id,
        question_id=answer.question_id,
        user_id=answer.user_id,
        username=current_user.username,
        reputation=getattr(current_user, 'reputation', 1) or 1,
        body=answer.body,
        upvote_count=0,
        downvote_count=0,
        score=0,
        is_accepted=answer.is_accepted,
        is_ai=answer.is_ai,
        user_vote_direction=0,
        comments=[],
        created_at=answer.created_at,
        updated_at=answer.updated_at,
    )


@router.put("/answers/{answer_id}", response_model=AnswerResponse)
async def update_answer(
    answer_id: int,
    body: AnswerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumAnswer).where(ForumAnswer.id == answer_id)
    )
    answer = result.scalar_one_or_none()
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")
    if answer.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")

    answer.body = body.body
    await db.commit()
    await db.refresh(answer)

    return AnswerResponse(
        id=answer.id,
        question_id=answer.question_id,
        user_id=answer.user_id,
        username=current_user.username,
        reputation=getattr(current_user, 'reputation', 1) or 1,
        body=answer.body,
        upvote_count=answer.upvote_count,
        downvote_count=answer.downvote_count,
        score=answer.upvote_count - answer.downvote_count,
        is_accepted=answer.is_accepted,
        is_ai=answer.is_ai,
        user_vote_direction=0,
        comments=[],
        created_at=answer.created_at,
        updated_at=answer.updated_at,
    )


@router.delete("/answers/{answer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_answer(
    answer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumAnswer).where(ForumAnswer.id == answer_id)
    )
    answer = result.scalar_one_or_none()
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")
    if answer.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")

    # Decrement answer_count on the parent question
    q_result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == answer.question_id)
    )
    question = q_result.scalar_one_or_none()
    if question and question.answer_count > 0:
        question.answer_count -= 1

    await db.delete(answer)
    await db.commit()


# ── Accept Answer ─────────────────────────────────────────────────────────────


@router.post("/answers/{answer_id}/accept")
async def accept_answer(
    answer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumAnswer).where(ForumAnswer.id == answer_id)
    )
    answer = result.scalar_one_or_none()
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")

    # Only the question author can accept
    q_result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == answer.question_id)
    )
    question = q_result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the question author can accept answers")

    # Unset any previously accepted answer on the same question
    prev_result = await db.execute(
        select(ForumAnswer).where(
            ForumAnswer.question_id == question.id,
            ForumAnswer.is_accepted == True,  # noqa: E712
        )
    )
    for prev in prev_result.scalars().all():
        prev.is_accepted = False

    answer.is_accepted = True
    question.is_answered = True

    # Reputation: answer author +15
    if answer.user_id != current_user.id:
        answerer = await db.execute(select(User).where(User.id == answer.user_id))
        answerer_user = answerer.scalar_one_or_none()
        if answerer_user:
            _adjust_rep(answerer_user, 15)

        create_notification(
            db, answer.user_id, "answer_accepted",
            f"Your answer was accepted on \"{question.title[:80]}\"",
            link=f"/forum/{question.id}",
        )

    # Transfer bounty if any
    bounty_amount = getattr(question, 'bounty', 0) or 0
    if bounty_amount > 0 and answer.user_id != current_user.id:
        answerer = await db.execute(select(User).where(User.id == answer.user_id))
        answerer_user = answerer.scalar_one_or_none()
        if answerer_user:
            _adjust_rep(answerer_user, bounty_amount)
        question.bounty = 0
        question.bounty_expires_at = None

    await db.commit()

    return {"detail": "Answer accepted"}


# ── Voting ────────────────────────────────────────────────────────────────────


@router.post("/questions/{question_id}/vote")
async def vote_question(
    question_id: int,
    vote: VoteRequest = VoteRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Downvote requires rep >= 50
    if vote.direction == -1:
        user_rep = getattr(current_user, 'reputation', 1) or 1
        if user_rep < 50:
            raise HTTPException(status_code=403, detail="Requires 50 reputation to downvote")

    # Get question author for reputation
    author_result = await db.execute(select(User).where(User.id == question.user_id))
    author = author_result.scalar_one_or_none()

    vote_result = await db.execute(
        select(ForumVote).where(
            ForumVote.user_id == current_user.id,
            ForumVote.target_type == "question",
            ForumVote.target_id == question_id,
        )
    )
    existing_vote = vote_result.scalar_one_or_none()

    direction = vote.direction
    if existing_vote:
        if existing_vote.direction == direction:
            # Same direction: toggle off — reverse reputation
            if existing_vote.direction == 1:
                question.upvote_count = max(question.upvote_count - 1, 0)
                if author and author.id != current_user.id:
                    _adjust_rep(author, -5)
            else:
                question.downvote_count = max(question.downvote_count - 1, 0)
                if author and author.id != current_user.id:
                    _adjust_rep(author, 5)
                _adjust_rep(current_user, 2)  # refund voter penalty
            await db.delete(existing_vote)
            direction = 0
        else:
            # Different direction: switch
            if existing_vote.direction == 1:
                question.upvote_count = max(question.upvote_count - 1, 0)
                if author and author.id != current_user.id:
                    _adjust_rep(author, -5)
            else:
                question.downvote_count = max(question.downvote_count - 1, 0)
                if author and author.id != current_user.id:
                    _adjust_rep(author, 5)
                _adjust_rep(current_user, 2)
            if direction == 1:
                question.upvote_count += 1
                if author and author.id != current_user.id:
                    _adjust_rep(author, 5)
            else:
                question.downvote_count += 1
                if author and author.id != current_user.id:
                    _adjust_rep(author, -5)
                _adjust_rep(current_user, -2)
            existing_vote.direction = direction
    else:
        if direction == 1:
            question.upvote_count += 1
            if author and author.id != current_user.id:
                _adjust_rep(author, 5)
                create_notification(
                    db, question.user_id, "upvote",
                    f"Your question was upvoted",
                    link=f"/forum/{question_id}",
                )
        elif direction == -1:
            question.downvote_count += 1
            if author and author.id != current_user.id:
                _adjust_rep(author, -5)
            _adjust_rep(current_user, -2)
        db.add(ForumVote(
            user_id=current_user.id,
            target_type="question",
            target_id=question_id,
            direction=direction,
        ))

    score = question.upvote_count - question.downvote_count
    up = question.upvote_count
    down = question.downvote_count
    await db.commit()
    return {
        "voted": direction,
        "score": score,
        "upvote_count": up,
        "downvote_count": down,
    }


@router.post("/answers/{answer_id}/vote")
async def vote_answer(
    answer_id: int,
    vote: VoteRequest = VoteRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumAnswer).where(ForumAnswer.id == answer_id)
    )
    answer = result.scalar_one_or_none()
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")

    # Downvote requires rep >= 50
    if vote.direction == -1:
        user_rep = getattr(current_user, 'reputation', 1) or 1
        if user_rep < 50:
            raise HTTPException(status_code=403, detail="Requires 50 reputation to downvote")

    # Get answer author for reputation
    author_result = await db.execute(select(User).where(User.id == answer.user_id))
    author = author_result.scalar_one_or_none()

    vote_result = await db.execute(
        select(ForumVote).where(
            ForumVote.user_id == current_user.id,
            ForumVote.target_type == "answer",
            ForumVote.target_id == answer_id,
        )
    )
    existing_vote = vote_result.scalar_one_or_none()

    direction = vote.direction
    if existing_vote:
        if existing_vote.direction == direction:
            # Same direction: toggle off — reverse reputation
            if existing_vote.direction == 1:
                answer.upvote_count = max(answer.upvote_count - 1, 0)
                if author and author.id != current_user.id:
                    _adjust_rep(author, -10)
            else:
                answer.downvote_count = max(answer.downvote_count - 1, 0)
                if author and author.id != current_user.id:
                    _adjust_rep(author, 5)
                _adjust_rep(current_user, 2)
            await db.delete(existing_vote)
            direction = 0
        else:
            # Different direction: switch
            if existing_vote.direction == 1:
                answer.upvote_count = max(answer.upvote_count - 1, 0)
                if author and author.id != current_user.id:
                    _adjust_rep(author, -10)
            else:
                answer.downvote_count = max(answer.downvote_count - 1, 0)
                if author and author.id != current_user.id:
                    _adjust_rep(author, 5)
                _adjust_rep(current_user, 2)
            if direction == 1:
                answer.upvote_count += 1
                if author and author.id != current_user.id:
                    _adjust_rep(author, 10)
            else:
                answer.downvote_count += 1
                if author and author.id != current_user.id:
                    _adjust_rep(author, -5)
                _adjust_rep(current_user, -2)
            existing_vote.direction = direction
    else:
        if direction == 1:
            answer.upvote_count += 1
            if author and author.id != current_user.id:
                _adjust_rep(author, 10)
        elif direction == -1:
            answer.downvote_count += 1
            if author and author.id != current_user.id:
                _adjust_rep(author, -5)
            _adjust_rep(current_user, -2)
        db.add(ForumVote(
            user_id=current_user.id,
            target_type="answer",
            target_id=answer_id,
            direction=direction,
        ))

    score = answer.upvote_count - answer.downvote_count
    up = answer.upvote_count
    down = answer.downvote_count
    await db.commit()
    return {
        "voted": direction,
        "score": score,
        "upvote_count": up,
        "downvote_count": down,
    }


# ── Bounty ───────────────────────────────────────────────────────────────────


@router.post("/questions/{question_id}/bounty")
async def add_bounty(
    question_id: int,
    body: BountyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the author can add a bounty")

    existing_bounty = getattr(question, 'bounty', 0) or 0
    if existing_bounty > 0:
        raise HTTPException(status_code=400, detail="Bounty already active")

    user_rep = getattr(current_user, 'reputation', 1) or 1
    if user_rep < body.amount:
        raise HTTPException(status_code=400, detail="Insufficient reputation")

    _adjust_rep(current_user, -body.amount)
    question.bounty = body.amount
    question.bounty_expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.commit()

    return {"detail": f"Bounty of {body.amount} added", "bounty": body.amount}


# ── AI Answer ────────────────────────────────────────────────────────────────


@router.post("/questions/{question_id}/ai-answer", response_model=AnswerResponse)
@limiter.limit("5/minute")
async def ai_answer(
    request: Request,
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.llm.service import evaluate_text

    result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    prompt = f"""You are a study assistant helping a student on an academic Q&A forum.

Question: {question.title}

{question.body}

Provide a thorough, well-structured answer focused on helping the student understand the concept.
Use LaTeX delimiters ($...$ for inline, $$...$$ for display) for mathematical notation where appropriate.
Be accurate and educational."""

    from app.crypto import decrypt_api_key
    api_key = None
    if current_user.encrypted_anthropic_key:
        try:
            api_key = decrypt_api_key(current_user.encrypted_anthropic_key)
        except Exception:
            pass

    try:
        ai_text = await evaluate_text(prompt, system_prompt="You are a knowledgeable study assistant. Provide clear, accurate, educational answers.", api_key=api_key)
    except ApiKeyRequiredError:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    answer = ForumAnswer(
        question_id=question_id,
        user_id=current_user.id,
        body=ai_text,
        is_ai=True,
    )
    db.add(answer)
    question.answer_count += 1

    # Notify question author
    if question.user_id != current_user.id:
        create_notification(
            db, question.user_id, "ai_answer",
            f"An AI answer was generated for your question",
            link=f"/forum/{question_id}",
        )

    await db.commit()
    await db.refresh(answer)

    return AnswerResponse(
        id=answer.id,
        question_id=answer.question_id,
        user_id=answer.user_id,
        username=current_user.username,
        reputation=getattr(current_user, 'reputation', 1) or 1,
        body=answer.body,
        upvote_count=0,
        downvote_count=0,
        score=0,
        is_accepted=False,
        is_ai=True,
        user_vote_direction=0,
        comments=[],
        created_at=answer.created_at,
        updated_at=answer.updated_at,
    )


# ── Find Similar ──────────────────────────────────────────────────────────────


@router.post("/questions/find-similar", response_model=FindSimilarResponse)
async def find_similar(
    body: FindSimilarRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    text = f"{body.title}\n{body.body}"[:2000]
    query_vec = await embed_text(text)

    similar_questions = await _get_similar_questions(db, query_vec)
    related_notes = await _get_related_notes(db, query_vec, current_user.id)

    return FindSimilarResponse(
        similar_questions=similar_questions,
        related_notes=related_notes,
    )


# ── Tags ──────────────────────────────────────────────────────────────────────


@router.get("/tags", response_model=list[TagCount])
async def list_tags(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ForumQuestion.tags))
    rows = result.all()

    counter: Counter[str] = Counter()
    for (tags_str,) in rows:
        if tags_str:
            for tag in tags_str.split(","):
                tag = tag.strip()
                if tag:
                    counter[tag] += 1

    sorted_tags = sorted(counter.items(), key=lambda x: x[1], reverse=True)
    return [TagCount(tag=tag, count=count) for tag, count in sorted_tags]


# ── Comments ─────────────────────────────────────────────────────────────────


@router.get("/questions/{question_id}/comments", response_model=list[CommentResponse])
async def list_question_comments(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == question_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Question not found")

    comments_result = await db.execute(
        select(ForumComment, User.username)
        .join(User, ForumComment.user_id == User.id)
        .where(
            ForumComment.target_type == "question",
            ForumComment.target_id == question_id,
        )
        .order_by(ForumComment.created_at.asc())
    )
    return [
        CommentResponse(
            id=c.id,
            user_id=c.user_id,
            username=c_username,
            body=c.body,
            created_at=c.created_at,
        )
        for c, c_username in comments_result.all()
    ]


@router.post(
    "/questions/{question_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_question_comment(
    question_id: int,
    body: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumQuestion).where(ForumQuestion.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    comment = ForumComment(
        user_id=current_user.id,
        target_type="question",
        target_id=question_id,
        body=body.body,
    )
    db.add(comment)

    # Notify question author
    if question.user_id != current_user.id:
        create_notification(
            db, question.user_id, "comment",
            f"{current_user.username} commented on your question",
            body=body.body[:100],
            link=f"/forum/{question_id}",
        )

    await db.commit()
    await db.refresh(comment)

    return CommentResponse(
        id=comment.id,
        user_id=comment.user_id,
        username=current_user.username,
        body=comment.body,
        created_at=comment.created_at,
    )


@router.get("/answers/{answer_id}/comments", response_model=list[CommentResponse])
async def list_answer_comments(
    answer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumAnswer).where(ForumAnswer.id == answer_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Answer not found")

    comments_result = await db.execute(
        select(ForumComment, User.username)
        .join(User, ForumComment.user_id == User.id)
        .where(
            ForumComment.target_type == "answer",
            ForumComment.target_id == answer_id,
        )
        .order_by(ForumComment.created_at.asc())
    )
    return [
        CommentResponse(
            id=c.id,
            user_id=c.user_id,
            username=c_username,
            body=c.body,
            created_at=c.created_at,
        )
        for c, c_username in comments_result.all()
    ]


@router.post(
    "/answers/{answer_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_answer_comment(
    answer_id: int,
    body: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumAnswer).where(ForumAnswer.id == answer_id)
    )
    answer_obj = result.scalar_one_or_none()
    if not answer_obj:
        raise HTTPException(status_code=404, detail="Answer not found")

    comment = ForumComment(
        user_id=current_user.id,
        target_type="answer",
        target_id=answer_id,
        body=body.body,
    )
    db.add(comment)

    # Notify answer author
    if answer_obj.user_id != current_user.id:
        create_notification(
            db, answer_obj.user_id, "comment",
            f"{current_user.username} commented on your answer",
            body=body.body[:100],
            link=f"/forum/{answer_obj.question_id}",
        )

    await db.commit()
    await db.refresh(comment)

    return CommentResponse(
        id=comment.id,
        user_id=comment.user_id,
        username=current_user.username,
        body=comment.body,
        created_at=comment.created_at,
    )


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumComment).where(ForumComment.id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")

    await db.delete(comment)
    await db.commit()
