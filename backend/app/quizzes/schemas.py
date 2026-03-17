import json
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class QuizGenerateRequest(BaseModel):
    note_id: int
    count: int = Field(default=10, ge=5, le=30)
    question_types: list[str] = ["multiple_choice", "true_false", "fill_blank"]


class QuestionResponse(BaseModel):
    id: int
    quiz_id: int
    question_type: str
    question_text: str
    options: list[str]
    correct_answer: str
    explanation: str
    order_index: int

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def parse_json_fields(cls, data):
        if hasattr(data, "__dict__"):
            obj = {}
            for field in [
                "id", "quiz_id", "question_type", "question_text",
                "options", "correct_answer", "explanation", "order_index",
            ]:
                obj[field] = getattr(data, field, None)
            data = obj

        val = data.get("options")
        if isinstance(val, str):
            try:
                data["options"] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                data["options"] = []
        return data


class QuizResponse(BaseModel):
    id: int
    title: str
    note_id: Optional[int]
    question_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class QuizDetailResponse(BaseModel):
    id: int
    title: str
    note_id: Optional[int]
    question_count: int
    created_at: datetime
    questions: list[QuestionResponse]

    model_config = {"from_attributes": True}


class AnswerSubmit(BaseModel):
    question_id: int
    user_answer: str


class QuizSubmitRequest(BaseModel):
    quiz_id: int
    answers: list[AnswerSubmit]
    time_seconds: int = 0


class AnswerResult(BaseModel):
    question_id: int
    question_text: str
    question_type: str
    options: list[str]
    user_answer: str
    correct_answer: str
    is_correct: bool
    explanation: str


class QuizAttemptResponse(BaseModel):
    id: int
    quiz_id: int
    score: int
    total_questions: int
    time_seconds: int
    completed_at: datetime
    results: list[AnswerResult]

    model_config = {"from_attributes": True}


class QuizAttemptListResponse(BaseModel):
    id: int
    quiz_id: int
    quiz_title: str
    score: int
    total_questions: int
    time_seconds: int
    completed_at: datetime

    model_config = {"from_attributes": True}


class QuizStatsResponse(BaseModel):
    total_quizzes: int
    total_attempts: int
    average_score: float
    best_score: float
