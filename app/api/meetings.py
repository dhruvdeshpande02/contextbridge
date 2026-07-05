import json
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, contains_eager, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.models.action_item import ActionItem
from app.models.decision import Decision
from app.models.gap import Gap
from app.models.meeting import Meeting
from app.models.meeting_chunk import MeetingChunk
from app.models.user import User
from app.schemas.meeting import (
    ActionItemOut,
    CalendarEvent,
    CalendarOut,
    DecisionOut,
    GapOut,
    MeetingAskOut,
    MeetingOut,
    MeetingQuery,
    MeetingQueryOut,
    MeetingUpload,
)
from app.services.llm import answer_with_context, embed_texts, stream_answer_with_context
from app.services.transcript_parser import parse_transcript
from app.tasks.process_meeting import process_meeting_task

router = APIRouter(prefix="/meetings", tags=["meetings"])


def _sse(payload: dict) -> str:
    """One Server-Sent-Events frame carrying a JSON payload."""
    return f"data: {json.dumps(payload)}\n\n"


def _get_owned_meeting(meeting_id: uuid.UUID, db: Session, user: User) -> Meeting:
    meeting = db.get(Meeting, meeting_id)
    if meeting is None or meeting.user_id != user.id:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.post("/reprocess-dates", status_code=202)
def reprocess_dates(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Re-queue all completed meetings that have no meeting_date so the Celery
    task re-runs extraction and populates meeting_date / action due_dates."""
    meetings = (
        db.query(Meeting)
        .filter(
            Meeting.user_id == user.id,
            Meeting.status == "completed",
            Meeting.meeting_date.is_(None),
        )
        .all()
    )
    for m in meetings:
        process_meeting_task.delay(str(m.id))
    return {"queued": len(meetings)}


@router.post("/upload", response_model=MeetingOut, status_code=201)
@limiter.limit("30/hour")
def upload_meeting(
    request: Request, payload: MeetingUpload, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    meeting = Meeting(
        user_id=user.id,
        title=payload.title,
        raw_transcript=payload.raw_transcript,
        meeting_date=payload.meeting_date,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    process_meeting_task.delay(str(meeting.id))
    return meeting


@router.post("/upload-file", response_model=MeetingOut, status_code=201)
@limiter.limit("30/hour")
async def upload_meeting_file(
    request: Request,
    title: str = Form(...),
    file: UploadFile = File(...),
    meeting_date: date | None = Form(None),
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

    meeting = Meeting(user_id=user.id, title=title, raw_transcript=transcript, meeting_date=meeting_date)
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


@router.get("/undated-actions", response_model=list[ActionItemOut])
def get_undated_actions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return all action items with no due_date across all completed meetings."""
    return (
        db.query(ActionItem)
        .join(Meeting, ActionItem.meeting_id == Meeting.id)
        .filter(
            Meeting.user_id == user.id,
            Meeting.status == "completed",
            ActionItem.due_date.is_(None),
        )
        .all()
    )


@router.get("/calendar", response_model=CalendarOut)
def get_calendar(
    start: date = Query(...),
    end: date = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Anchor date = explicit meeting_date, falling back to the upload day.
    # Filtering on this expression in SQL means we only ever fetch (and
    # eager-load decisions/gaps for) meetings that actually fall in the
    # requested window, instead of loading every completed meeting and
    # discarding most of them in Python.
    anchor_date = func.coalesce(Meeting.meeting_date, func.date(Meeting.created_at))

    meetings = (
        db.query(Meeting)
        .filter(
            Meeting.user_id == user.id,
            Meeting.status == "completed",
            anchor_date >= start,
            anchor_date <= end,
        )
        .options(
            selectinload(Meeting.decisions),
            selectinload(Meeting.gaps),
        )
        .all()
    )

    events: list[CalendarEvent] = []

    for m in meetings:
        anchor = m.meeting_date or m.created_at.date()

        events.append(CalendarEvent(
            id=m.id, type="meeting", title=m.title,
            date=anchor, meeting_id=m.id, meeting_title=m.title,
        ))

        for d in m.decisions:
            events.append(CalendarEvent(
                id=d.id, type="decision", title=d.text,
                date=anchor, meeting_id=m.id, meeting_title=m.title,
                meta={"owner": d.owner, "confidence": d.confidence},
            ))

        for g in m.gaps:
            events.append(CalendarEvent(
                id=g.id, type="gap", title=g.description,
                date=anchor, meeting_id=m.id, meeting_title=m.title,
                meta={"risk_level": g.risk_level},
            ))

    # Action item due_date can fall in-range even when its parent meeting's
    # anchor date doesn't, so this is a separate query — join + contains_eager
    # pulls the parent title in the same round trip instead of a second query
    # or an in-Python lookup cache.
    action_items = (
        db.query(ActionItem)
        .join(Meeting, ActionItem.meeting_id == Meeting.id)
        .options(contains_eager(ActionItem.meeting))
        .filter(
            Meeting.user_id == user.id,
            Meeting.status == "completed",
            ActionItem.due_date.isnot(None),
            ActionItem.due_date >= start,
            ActionItem.due_date <= end,
        )
        .all()
    )
    for a in action_items:
        events.append(CalendarEvent(
            id=a.id, type="action", title=a.text,
            date=a.due_date, meeting_id=a.meeting_id,
            meeting_title=a.meeting.title,
            meta={"assignee": a.assignee, "depends_on": a.depends_on},
        ))

    events.sort(key=lambda e: e.date)
    return CalendarOut(events=events)


@router.post("/{meeting_id}/reprocess", response_model=MeetingOut, status_code=202)
def reprocess_meeting(meeting_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Reset a failed meeting to pending and re-queue it for processing."""
    meeting = _get_owned_meeting(meeting_id, db, user)
    if meeting.status != "failed":
        raise HTTPException(status_code=400, detail="Only failed meetings can be reprocessed")

    # Delete stale child records so the task starts clean
    db.query(Decision).filter(Decision.meeting_id == meeting.id).delete()
    db.query(ActionItem).filter(ActionItem.meeting_id == meeting.id).delete()
    db.query(Gap).filter(Gap.meeting_id == meeting.id).delete()
    db.query(MeetingChunk).filter(MeetingChunk.meeting_id == meeting.id).delete()

    meeting.status = "pending"
    db.commit()
    db.refresh(meeting)

    process_meeting_task.delay(str(meeting.id))
    return meeting


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _get_owned_meeting(meeting_id, db, user)


@router.post("/{meeting_id}/ask", response_model=MeetingAskOut)
@limiter.limit("20/minute")
def ask_meeting(
    request: Request,
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


@router.post("/{meeting_id}/ask/stream")
@limiter.limit("20/minute")
def ask_meeting_stream(
    request: Request,
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

    def event_stream():
        if not chunks:
            yield _sse({"type": "token", "text": "No content found for this meeting."})
            yield _sse({"type": "done"})
            return
        try:
            for token in stream_answer_with_context(payload.question, [c.text for c in chunks]):
                yield _sse({"type": "token", "text": token})
        except Exception as exc:
            yield _sse({"type": "error", "message": str(exc)})
        yield _sse({"type": "done"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/query", response_model=MeetingQueryOut)
@limiter.limit("20/minute")
def query_meetings(request: Request, payload: MeetingQuery, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    all_meetings = (
        db.query(Meeting)
        .filter(Meeting.user_id == user.id)
        .order_by(Meeting.created_at.desc())
        .all()
    )

    completed = [m for m in all_meetings if m.status == "completed"]

    if not completed:
        return MeetingQueryOut(answer="No processed meetings found to search yet.", sources=[])

    metadata_lines = [
        f"Total meetings uploaded: {len(all_meetings)}",
        f"Total meetings processed (completed): {len(completed)}",
        "Meeting list (title | status | date):",
    ] + [
        f"  - {m.title} | {m.status} | {m.created_at.strftime('%Y-%m-%d')}"
        for m in all_meetings
    ]
    metadata = "\n".join(metadata_lines)

    [query_embedding] = embed_texts([payload.question])

    top_chunks = (
        db.query(MeetingChunk)
        .join(Meeting, MeetingChunk.meeting_id == Meeting.id)
        .filter(Meeting.user_id == user.id)
        .order_by(MeetingChunk.embedding.cosine_distance(query_embedding))
        .limit(5)
        .all()
    )

    answer = answer_with_context(payload.question, [c.text for c in top_chunks], metadata=metadata)
    sources = list({c.meeting_id for c in top_chunks})
    return MeetingQueryOut(answer=answer, sources=sources)


@router.post("/query/stream")
@limiter.limit("20/minute")
def query_meetings_stream(request: Request, payload: MeetingQuery, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    all_meetings = (
        db.query(Meeting)
        .filter(Meeting.user_id == user.id)
        .order_by(Meeting.created_at.desc())
        .all()
    )

    completed = [m for m in all_meetings if m.status == "completed"]

    if not completed:
        def empty_stream():
            yield _sse({"type": "sources", "sources": []})
            yield _sse({"type": "token", "text": "No processed meetings found to search yet."})
            yield _sse({"type": "done"})
        return StreamingResponse(empty_stream(), media_type="text/event-stream")

    metadata_lines = [
        f"Total meetings uploaded: {len(all_meetings)}",
        f"Total meetings processed (completed): {len(completed)}",
        "Meeting list (title | status | date):",
    ] + [
        f"  - {m.title} | {m.status} | {m.created_at.strftime('%Y-%m-%d')}"
        for m in all_meetings
    ]
    metadata = "\n".join(metadata_lines)

    [query_embedding] = embed_texts([payload.question])

    top_chunks = (
        db.query(MeetingChunk)
        .join(Meeting, MeetingChunk.meeting_id == Meeting.id)
        .filter(Meeting.user_id == user.id)
        .order_by(MeetingChunk.embedding.cosine_distance(query_embedding))
        .limit(5)
        .all()
    )
    sources = [str(mid) for mid in {c.meeting_id for c in top_chunks}]

    def event_stream():
        # Sources are known up front (from the vector search), so send them
        # before the first token — the UI can render source chips immediately
        # instead of waiting for the answer to finish.
        yield _sse({"type": "sources", "sources": sources})
        try:
            for token in stream_answer_with_context(payload.question, [c.text for c in top_chunks], metadata=metadata):
                yield _sse({"type": "token", "text": token})
        except Exception as exc:
            yield _sse({"type": "error", "message": str(exc)})
        yield _sse({"type": "done"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
