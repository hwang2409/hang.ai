from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class FileResponse(BaseModel):
    id: int
    original_name: str
    file_type: str
    mime_type: str
    size_bytes: int
    folder_id: Optional[int] = None
    has_extracted_text: bool = False
    metadata: Optional[dict] = None
    source_url: Optional[str] = None
    transcription_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
