from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class HybridSearchRequest(BaseModel):
    query: str
    limit: int = 20


class SearchResultItem(BaseModel):
    id: int
    title: str
    preview: str
    type: str = "text"
    tags: list[dict] = []
    match_type: str  # "keyword" | "semantic" | "both"
    score: float
    updated_at: datetime

    model_config = {"from_attributes": True}


class HybridSearchResponse(BaseModel):
    results: list[SearchResultItem]
    query: str
