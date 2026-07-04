import uuid
from datetime import date

from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.action_item import ActionItem
from app.models.decision import Decision
from app.models.gap import Gap
from app.models.meeting import Meeting, MeetingStatus
from app.models.meeting_chunk import MeetingChunk
from app.services.chunking import chunk_text
from app.services.llm import embed_texts, extract_meeting_intelligence


@celery_app.task(name="process_meeting")
def process_meeting_task(meeting_id: str):
    db = SessionLocal()
    try:
        meeting = db.get(Meeting, uuid.UUID(meeting_id))
        if meeting is None:
            return
        meeting.status = MeetingStatus.processing
        db.commit()

        try:
            result = extract_meeting_intelligence(meeting.raw_transcript)

            # Only overwrite meeting_date if the user didn't supply one manually
            if meeting.meeting_date is None:
                raw_meeting_date = result.get("meeting_date")
                if raw_meeting_date:
                    try:
                        meeting.meeting_date = date.fromisoformat(raw_meeting_date)
                    except ValueError:
                        pass

            for d in result["decisions"]:
                db.add(Decision(meeting_id=meeting.id, text=d["text"], owner=d["owner"], confidence=d["confidence"]))
            for a in result["action_items"]:
                raw_due = a.get("due_date")
                due = None
                if raw_due:
                    try:
                        due = date.fromisoformat(raw_due)
                    except ValueError:
                        pass
                db.add(
                    ActionItem(
                        meeting_id=meeting.id,
                        text=a["text"],
                        assignee=a["assignee"],
                        depends_on=a["depends_on"],
                        due_date=due,
                    )
                )
            for g in result["gaps"]:
                db.add(Gap(meeting_id=meeting.id, description=g["description"], risk_level=g["risk_level"]))

            chunks = chunk_text(meeting.raw_transcript)
            if chunks:
                embeddings = embed_texts(chunks)
                for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                    db.add(MeetingChunk(meeting_id=meeting.id, chunk_index=idx, text=chunk, embedding=embedding))

            meeting.status = MeetingStatus.completed
        except Exception:
            meeting.status = MeetingStatus.failed
            raise
        finally:
            db.commit()
    finally:
        db.close()
