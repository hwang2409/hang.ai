from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AnnotationCreate(BaseModel):
    document_id: int
    selected_text: str
    annotation_content: str = ""
    start_offset: int
    end_offset: int
    color: str = "default"


class AnnotationUpdate(BaseModel):
    annotation_content: Optional[str] = None
    color: Optional[str] = None


class AnnotationResponse(BaseModel):
    id: int
    document_id: int
    user_id: int
    selected_text: str
    annotation_content: str
    start_offset: int
    end_offset: int
    color: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
