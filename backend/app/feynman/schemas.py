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
