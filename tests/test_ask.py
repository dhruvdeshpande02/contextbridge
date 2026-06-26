"""
Tests for the meeting-scoped Q&A endpoint: POST /meetings/{id}/ask
"""
import uuid
from unittest.mock import patch

TRANSCRIPT = "Alice: We decided to ship by Friday. Bob will own the backend deployment."


def _upload(client, auth_headers, title="Test Meeting"):
    res = client.post(
        "/meetings/upload",
        json={"title": title, "raw_transcript": TRANSCRIPT},
        headers=auth_headers,
    )
    assert res.status_code == 201
    return res.json()["id"]


def _mark_completed(db_session, meeting_id: str):
    """Directly set meeting status + insert a fake chunk so /ask has something to search."""
    from app.models.meeting import Meeting, MeetingStatus
    from app.models.meeting_chunk import MeetingChunk

    meeting = db_session.get(Meeting, uuid.UUID(meeting_id))
    meeting.status = MeetingStatus.completed

    # Insert a fake chunk with a zeroed embedding (pgvector needs a real vector)
    chunk = MeetingChunk(
        meeting_id=meeting.id,
        chunk_index=0,
        text=TRANSCRIPT,
        embedding=[0.0] * 1536,
    )
    db_session.add(chunk)
    db_session.commit()


def test_ask_returns_answer(client, auth_headers, db_session):
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid)

    with patch("app.api.meetings.embed_texts", return_value=[[0.0] * 1536]), \
         patch("app.api.meetings.answer_with_context", return_value="Alice decided to ship Friday."):
        res = client.post(
            f"/meetings/{mid}/ask",
            json={"question": "What was decided?"},
            headers=auth_headers,
        )

    assert res.status_code == 200
    assert res.json()["answer"] == "Alice decided to ship Friday."


def test_ask_rejects_unprocessed_meeting(client, auth_headers):
    mid = _upload(client, auth_headers)
    # Meeting is still "pending" — should get 400
    with patch("app.api.meetings.embed_texts", return_value=[[0.0] * 1536]):
        res = client.post(
            f"/meetings/{mid}/ask",
            json={"question": "What was decided?"},
            headers=auth_headers,
        )
    assert res.status_code == 400
    assert "not yet processed" in res.json()["detail"].lower()


def test_ask_returns_404_for_wrong_user(client, auth_headers, db_session):
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid)

    # Register a second user
    client.post("/auth/register", json={"email": "other2@test.com", "password": "pw123456"})
    login = client.post("/auth/login", data={"username": "other2@test.com", "password": "pw123456"})
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    res = client.post(
        f"/meetings/{mid}/ask",
        json={"question": "What was decided?"},
        headers=other_headers,
    )
    assert res.status_code == 404


def test_ask_returns_404_for_nonexistent_meeting(client, auth_headers):
    res = client.post(
        f"/meetings/{uuid.uuid4()}/ask",
        json={"question": "What was decided?"},
        headers=auth_headers,
    )
    assert res.status_code == 404


def test_ask_requires_auth(client, auth_headers, db_session):
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid)

    res = client.post(f"/meetings/{mid}/ask", json={"question": "test"})
    assert res.status_code == 401
