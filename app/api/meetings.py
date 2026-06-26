import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.action_item import ActionItem
from app.models.decision import Decision
from app.models.gap import Gap
from app.models.meeting import Meeting
from app.models.meeting_chunk import MeetingChunk
from app.models.user import User
from app.schemas.meeting import (
    ActionItemOut,
    DecisionOut,
    GapOut,
    MeetingAskOut,
    MeetingOut,
    MeetingQuery,
    MeetingQueryOut,
    MeetingUpload,
)
from app.services.llm import answer_with_context, embed_texts
from app.services.transcript_parser import parse_transcript
from app.tasks.process_meeting import process_meeting_task

router = APIRouter(prefix="/meetings", tags=["meetings"])


def _get_owned_meeting(meeting_id: uuid.UUID, db: Session, user: User) -> Meeting:
    meeting = db.get(Meeting, meeting_id)
    if meeting is None or meeting.user_id != user.id:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.post("/upload", response_model=MeetingOut, status_code=201)
def upload_meeting(
    payload: MeetingUpload, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    meeting = Meeting(user_id=user.id, title=payload.title, raw_transcript=payload.raw_transcript)
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    process_meeting_task.delay(str(meeting.id))
    return meeting


@router.post("/upload-file", response_model=MeetingOut, status_code=201)
async def upload_meeting_file(
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    allowed = {"vtt", "txt", "docx"}
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type .{ext}. Allowed: .vtt, .txt, .docx")

    content = await file.read()
    try:
        transcript = parse_transcript(file.filename or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not transcript.strip():
        raise HTTPException(status_code=400, detail="Parsed transcript is empty. Check the file contents.")

    meeting = Meeting(user_id=user.id, title=title, raw_transcript=transcript)
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    process_meeting_task.delay(str(meeting.id))
    return meeting


@router.get("", response_model=list[MeetingOut])
def list_meetings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Meeting).filter(Meeting.user_id == user.id).order_by(Meeting.created_at.desc()).all()


@router.get("/{meeting_id}/decisions", response_model=list[DecisionOut])
def get_decisions(meeting_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    meeting = _get_owned_meeting(meeting_id, db, user)
    return db.query(Decision).filter(Decision.meeting_id == meeting.id).all()


@router.get("/{meeting_id}/actions", response_model=list[ActionItemOut])
def get_actions(meeting_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    meeting = _get_owned_meeting(meeting_id, db, user)
    return db.query(ActionItem).filter(ActionItem.meeting_id == meeting.id).all()


@router.get("/{meeting_id}/gaps", response_model=list[GapOut])
def get_gaps(meeting_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    meeting = _get_owned_meeting(meeting_id, db, user)
    return db.query(Gap).filter(Gap.meeting_id == meeting.id).all()


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _get_owned_meeting(meeting_id, db, user)


@router.post("/{meeting_id}/ask", response_model=MeetingAskOut)
def ask_meeting(
    meeting_id: uuid.UUID,
    payload: MeetingQuery,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meeting = _get_owned_meeting(meeting_id, db, user)
    if meeting.status != "completed":
        raise HTTPException(status_code=400, detail="Meeting is not yet processed")

    [query_embedding] = embed_texts([payload.question])

    chunks = (
        db.query(MeetingChunk)
        .filter(MeetingChunk.meeting_id == meeting.id)
        .order_by(MeetingChunk.embedding.cosine_distance(query_embedding))
        .limit(5)
        .all()
    )

    if not chunks:
        return MeetingAskOut(answer="No content found for this meeting.")

    answer = answer_with_context(payload.question, [c.text for c in chunks])
    return MeetingAskOut(answer=answer)


@router.post("/query", response_model=MeetingQueryOut)
def query_meetings(payload: MeetingQuery, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    [query_embedding] = embed_texts([payload.question])

    top_chunks = (
        db.query(MeetingChunk)
        .join(Meeting, MeetingChunk.meeting_id == Meeting.id)
        .filter(Meeting.user_id == user.id)
        .order_by(MeetingChunk.embedding.cosine_distance(query_embedding))
        .limit(5)
        .all()
    )

    if not top_chunks:
        return MeetingQueryOut(answer="No processed meetings found to search yet.", sources=[])

    answer = answer_with_context(payload.question, [c.text for c in top_chunks])
    sources = list({c.meeting_id for c in top_chunks})
    return MeetingQueryOut(answer=answer, sources=sources)
