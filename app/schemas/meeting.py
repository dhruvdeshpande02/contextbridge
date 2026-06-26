import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.meeting import MeetingStatus


class MeetingUpload(BaseModel):
    title: str
    raw_transcript: str


class MeetingOut(BaseModel):
    id: uuid.UUID
    title: str
    status: MeetingStatus
    created_at: datetime

    class Config:
        from_attributes = True


class DecisionOut(BaseModel):
    id: uuid.UUID
    text: str
    owner: str | None
    confidence: float

    class Config:
        from_attributes = True


class ActionItemOut(BaseModel):
    id: uuid.UUID
    text: str
    assignee: str | None
    depends_on: str | None

    class Config:
        from_attributes = True


class GapOut(BaseModel):
    id: uuid.UUID
    description: str
    risk_level: str

    class Config:
        from_attributes = True


class MeetingQuery(BaseModel):
    question: str


class MeetingQueryOut(BaseModel):
    answer: str
    sources: list[uuid.UUID]


class MeetingAskOut(BaseModel):
    answer: str
