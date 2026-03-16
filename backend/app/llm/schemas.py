from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    thread_id: Optional[int] = None
    note_id: Optional[int] = None
    file_id: Optional[int] = None
    selected_text: Optional[str] = None


class ThreadResponse(BaseModel):
    id: int
    title: str
    note_id: Optional[int]
    file_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: int
    thread_id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EvaluateRequest(BaseModel):
    task: str  # "summary" | "improve" | "analyze"
    content: str


class EvaluateResponse(BaseModel):
    result: str


class SelectionActionRequest(BaseModel):
    action: str  # "summarize" | "define" | "explain"
    selected_text: str
    note_context: Optional[str] = None


class SelectionActionResponse(BaseModel):
    result: str
