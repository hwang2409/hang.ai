from datetime import datetime

from pydantic import BaseModel, Field


class QuestionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)
    tags: list[str] = []
    linked_note_id: int | None = None


class QuestionUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    tags: list[str] | None = None


class QuestionSummary(BaseModel):
    id: int
    title: str
    tags: list[str]
    username: str
    user_id: int
    reputation: int = 1
    upvote_count: int
    downvote_count: int
    score: int
    answer_count: int
    view_count: int
    is_answered: bool
    is_bookmarked: bool = False
    status: str = "open"
    duplicate_of_id: int | None = None
    bounty: int = 0
    bounty_expires_at: datetime | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


class SimilarQuestion(BaseModel):
    id: int
    title: str
    score: float


class RelatedNote(BaseModel):
    id: int
    title: str
    score: float


class AnswerCreate(BaseModel):
    body: str = Field(min_length=1)


class VoteRequest(BaseModel):
    direction: int = Field(default=1, ge=-1, le=1)  # 1=up, -1=down


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=600)


class CommentResponse(BaseModel):
    id: int
    user_id: int
    username: str
    body: str
    created_at: datetime
    model_config = {"from_attributes": True}


class AnswerResponse(BaseModel):
    id: int
    question_id: int
    user_id: int
    username: str
    reputation: int = 1
    body: str
    upvote_count: int
    downvote_count: int
    score: int
    is_accepted: bool
    is_ai: bool
    user_vote_direction: int = 0
    comments: list[CommentResponse] = []
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class QuestionDetail(BaseModel):
    id: int
    title: str
    body: str
    tags: list[str]
    username: str
    user_id: int
    reputation: int = 1
    upvote_count: int
    downvote_count: int
    score: int
    answer_count: int
    view_count: int
    is_answered: bool
    is_bookmarked: bool = False
    status: str = "open"
    duplicate_of_id: int | None = None
    bounty: int = 0
    bounty_expires_at: datetime | None = None
    linked_note_id: int | None
    user_vote_direction: int = 0
    comments: list[CommentResponse] = []
    answers: list[AnswerResponse] = []
    similar_questions: list[SimilarQuestion] = []
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class FindSimilarRequest(BaseModel):
    title: str
    body: str = ""


class FindSimilarResponse(BaseModel):
    similar_questions: list[SimilarQuestion] = []
    related_notes: list[RelatedNote] = []


class TagCount(BaseModel):
    tag: str
    count: int


class CloseQuestionRequest(BaseModel):
    status: str = "closed"  # "closed" or "duplicate"
    duplicate_of_id: int | None = None


class BountyRequest(BaseModel):
    amount: int = Field(ge=50, le=500)
