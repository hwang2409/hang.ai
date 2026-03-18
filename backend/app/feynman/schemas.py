import json
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, model_validator


class SessionCreate(BaseModel):
    topic: str
    explanation: str
    note_id: Optional[int] = None


class SessionResponse(BaseModel):
    id: int
    topic: str
    explanation: str
    score: int
    strengths: list[str]
    weaknesses: list[str]
    feedback: str
    note_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def parse_json_fields(cls, data):
        # Handle both dict and ORM object
        if hasattr(data, "__dict__"):
            # ORM model — convert to dict
            obj = {}
            for field in [
                "id", "topic", "explanation", "score", "strengths",
                "weaknesses", "feedback", "note_id", "created_at",
            ]:
                obj[field] = getattr(data, field, None)
            data = obj

        for field in ("strengths", "weaknesses"):
            val = data.get(field)
            if isinstance(val, str):
                try:
                    data[field] = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    data[field] = []
        return data


class SessionListResponse(BaseModel):
    id: int
    topic: str
    score: int
    note_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Socratic schemas ---

class SocraticStartRequest(BaseModel):
    topic: str
    note_id: Optional[int] = None


class SocraticReplyRequest(BaseModel):
    message: str


class SocraticMessage(BaseModel):
    role: str  # "ai" | "user"
    content: str


class SocraticSessionResponse(BaseModel):
    id: int
    topic: str
    messages: list[SocraticMessage]
    status: str
    question_count: int
    score: Optional[int]
    strengths: list[str]
    weaknesses: list[str]
    feedback: str
    note_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def parse_socratic_fields(cls, data):
        if hasattr(data, "__dict__"):
            obj = {}
            for field in [
                "id", "topic", "messages", "status", "question_count",
                "score", "strengths", "weaknesses", "feedback",
                "note_id", "created_at",
            ]:
                obj[field] = getattr(data, field, None)
            data = obj

        # Parse messages JSON
        val = data.get("messages")
        if isinstance(val, str):
            try:
                data["messages"] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                data["messages"] = []

        for field in ("strengths", "weaknesses"):
            val = data.get(field)
            if isinstance(val, str):
                try:
                    data[field] = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    data[field] = []
        return data


class SocraticSessionListResponse(BaseModel):
    id: int
    topic: str
    status: str
    score: Optional[int]
    question_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
