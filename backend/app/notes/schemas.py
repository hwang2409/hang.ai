from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TagCreate(BaseModel):
    name: str


class TagResponse(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None


class FolderResponse(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentCreate(BaseModel):
    title: str = "Untitled"
    content: str = ""
    type: str = "text"
    folder_id: Optional[int] = None
    tag_ids: list[int] = []


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    folder_id: Optional[int] = None
    tag_ids: Optional[list[int]] = None
    tags: Optional[list[str]] = None  # tag names — resolved to Tag objects


class DocumentResponse(BaseModel):
    id: int
    title: str
    content: str
    type: str
    user_id: int
    folder_id: Optional[int]
    preview_image_url: Optional[str]
    share_token: Optional[str] = None
    deleted: bool
    created_at: datetime
    updated_at: datetime
    tags: list[TagResponse] = []

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    id: int
    title: str
    preview: str
    type: str
    user_id: int
    folder_id: Optional[int]
    preview_image_url: Optional[str]
    deleted: bool
    created_at: datetime
    updated_at: datetime
    tags: list[TagResponse] = []

    model_config = {"from_attributes": True}


class SearchRequest(BaseModel):
    query: str


class DocumentLinkCreate(BaseModel):
    target_id: int


class LinkedNoteResponse(BaseModel):
    link_id: int
    note_id: int
    title: str
    preview: str
    type: str
    folder_id: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}
