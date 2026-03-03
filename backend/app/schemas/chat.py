import uuid
from datetime import datetime
from pydantic import BaseModel


class ChatMessageIn(BaseModel):
    content: str
    session_id: uuid.UUID | None = None


class ChatMessageOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionOut(BaseModel):
    id: uuid.UUID
    title: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionCreate(BaseModel):
    title: str | None = None
