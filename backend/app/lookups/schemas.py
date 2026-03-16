from datetime import datetime

from pydantic import BaseModel


class LookupCreate(BaseModel):
    document_id: int
    action: str
    selected_text: str
    result: str


class LookupResponse(BaseModel):
    id: int
    document_id: int
    user_id: int
    action: str
    selected_text: str
    result: str
    created_at: datetime

    model_config = {"from_attributes": True}
