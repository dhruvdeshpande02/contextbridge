import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel

from app.models.meeting import MeetingStatus


class MeetingUpload(BaseModel):
    title: str
    raw_transcript: str
    meeting_date: date | None = None


class MeetingOut(BaseModel):
    id: uuid.UUID
    title: str
    status: MeetingStatus
    created_at: datetime
    meeting_date: date | None = None

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
    due_date: date | None = None

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


class CalendarEvent(BaseModel):
    id: uuid.UUID
    type: Literal["meeting", "action", "decision", "gap"]
    title: str
    date: date
    meeting_id: uuid.UUID
    meeting_title: str
    meta: dict[str, Any] = {}


class CalendarOut(BaseModel):
    events: list[CalendarEvent]
