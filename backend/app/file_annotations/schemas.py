from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class FileAnnotationCreate(BaseModel):
    file_id: int
    annotation_type: str  # "text_selection" or "timestamp"
    selected_text: Optional[str] = None
    annotation_content: str = ""
    page_number: Optional[int] = None
    timestamp: Optional[float] = None
    color: str = "default"


class FileAnnotationUpdate(BaseModel):
    annotation_content: Optional[str] = None
    color: Optional[str] = None


class FileAnnotationResponse(BaseModel):
    id: int
    file_id: int
    user_id: int
    annotation_type: str
    selected_text: Optional[str]
    annotation_content: str
    page_number: Optional[int]
    timestamp: Optional[float]
    color: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
