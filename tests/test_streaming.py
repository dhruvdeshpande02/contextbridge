"""
Tests for the streaming Q&A endpoints:
POST /meetings/{id}/ask/stream and POST /meetings/query/stream

The response body is Server-Sent-Events (`data: {...}\n\n` frames). TestClient
buffers the whole streamed body, so we just parse each `data:` line as JSON.
"""
import json
import uuid
from unittest.mock import patch

TRANSCRIPT = "Alice: We decided to ship by Friday. Bob will own the backend deployment."


def _parse_sse(body: str) -> list[dict]:
    events = []
    for line in body.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[len("data: "):]))
    return events


def _upload(client, auth_headers, title="Stream Test Meeting"):
    res = client.post(
        "/meetings/upload",
        json={"title": title, "raw_transcript": TRANSCRIPT},
        headers=auth_headers,
    )
    assert res.status_code == 201
    return res.json()["id"]


def _mark_completed(db_session, meeting_id: str):
    from app.models.meeting import Meeting, MeetingStatus
    from app.models.meeting_chunk import MeetingChunk

    meeting = db_session.get(Meeting, uuid.UUID(meeting_id))
    meeting.status = MeetingStatus.completed

    chunk = MeetingChunk(
        meeting_id=meeting.id,
        chunk_index=0,
        text=TRANSCRIPT,
        embedding=[0.0] * 1536,
    )
    db_session.add(chunk)
    db_session.commit()


def _fake_stream(tokens):
    """Mimics stream_answer_with_context's generator interface."""
    for t in tokens:
        yield t


# ── /meetings/{id}/ask/stream ────────────────────────────────────────────────

def test_ask_stream_emits_tokens_then_done(client, auth_headers, db_session):
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid)

    with patch("app.api.meetings.embed_texts", return_value=[[0.0] * 1536]), \
         patch("app.api.meetings.stream_answer_with_context", return_value=_fake_stream(["Alice ", "decided ", "to ship."])):
        res = client.post(
            f"/meetings/{mid}/ask/stream",
            json={"question": "What was decided?"},
            headers=auth_headers,
        )

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")

    events = _parse_sse(res.text)
    tokens = [e["text"] for e in events if e["type"] == "token"]
    assert tokens == ["Alice ", "decided ", "to ship."]
    assert events[-1] == {"type": "done"}


def test_ask_stream_rejects_unprocessed_meeting(client, auth_headers):
    mid = _upload(client, auth_headers)
    with patch("app.api.meetings.embed_texts", return_value=[[0.0] * 1536]):
        res = client.post(
            f"/meetings/{mid}/ask/stream",
            json={"question": "What was decided?"},
            headers=auth_headers,
        )
    assert res.status_code == 400


def test_ask_stream_no_chunks_returns_fallback_message(client, auth_headers, db_session):
    from app.models.meeting import Meeting, MeetingStatus

    mid = _upload(client, auth_headers)
    meeting = db_session.get(Meeting, uuid.UUID(mid))
    meeting.status = MeetingStatus.completed
    db_session.commit()

    with patch("app.api.meetings.embed_texts", return_value=[[0.0] * 1536]):
        res = client.post(
            f"/meetings/{mid}/ask/stream",
            json={"question": "What was decided?"},
            headers=auth_headers,
        )

    events = _parse_sse(res.text)
    tokens = [e["text"] for e in events if e["type"] == "token"]
    assert tokens == ["No content found for this meeting."]
    assert events[-1] == {"type": "done"}


def test_ask_stream_requires_auth(client, auth_headers, db_session):
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid)

    res = client.post(f"/meetings/{mid}/ask/stream", json={"question": "test"})
    assert res.status_code == 401


def test_ask_stream_surfaces_mid_stream_error(client, auth_headers, db_session):
    """If the OpenAI call blows up after streaming has started, emit an error
    frame instead of a raw 500 — the connection is already open."""
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid)

    def _boom():
        yield "partial "
        raise RuntimeError("upstream exploded")

    with patch("app.api.meetings.embed_texts", return_value=[[0.0] * 1536]), \
         patch("app.api.meetings.stream_answer_with_context", return_value=_boom()):
        res = client.post(
            f"/meetings/{mid}/ask/stream",
            json={"question": "What was decided?"},
            headers=auth_headers,
        )

    events = _parse_sse(res.text)
    assert events[0] == {"type": "token", "text": "partial "}
    assert events[1]["type"] == "error"
    assert events[-1] == {"type": "done"}


# ── /meetings/query/stream ───────────────────────────────────────────────────

def test_query_stream_emits_sources_then_tokens(client, auth_headers, db_session):
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid)

    with patch("app.api.meetings.embed_texts", return_value=[[0.0] * 1536]), \
         patch("app.api.meetings.stream_answer_with_context", return_value=_fake_stream(["It ", "was ", "Friday."])):
        res = client.post(
            "/meetings/query/stream",
            json={"question": "What was decided?"},
            headers=auth_headers,
        )

    assert res.status_code == 200
    events = _parse_sse(res.text)

    assert events[0]["type"] == "sources"
    assert events[0]["sources"] == [mid]

    tokens = [e["text"] for e in events if e["type"] == "token"]
    assert tokens == ["It ", "was ", "Friday."]
    assert events[-1] == {"type": "done"}


def test_query_stream_no_processed_meetings(client, auth_headers):
    res = client.post(
        "/meetings/query/stream",
        json={"question": "anything"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    events = _parse_sse(res.text)
    assert events[0] == {"type": "sources", "sources": []}
    tokens = [e["text"] for e in events if e["type"] == "token"]
    assert tokens == ["No processed meetings found to search yet."]


def test_query_stream_requires_auth():
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as c:
        res = c.post("/meetings/query/stream", json={"question": "test"})
    assert res.status_code == 401
