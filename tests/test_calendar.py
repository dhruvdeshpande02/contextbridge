"""
Tests for GET /meetings/calendar

Covers:
- Events returned for meetings in range (using created_at fallback)
- Events returned for meetings with explicit meeting_date
- Meetings outside the date range are excluded
- Pending/processing/failed meetings are excluded (only completed shown)
- Decisions and gaps are emitted on the meeting's anchor date
- Action items with due_date in range are emitted on their due_date
- Action items without due_date are not emitted
- Action items with due_date outside range are excluded
- Events are sorted by date ascending
- Other user's meetings are not visible
- Requires authentication (401 without token)
- Missing query params returns 422
"""
import uuid
from datetime import date, datetime, timezone

import pytest

TRANSCRIPT = "Alice: We decided to use ALB. Bob will set up ECS by July 10."

# ── Helpers ────────────────────────────────────────────────────────────────────

def _upload(client, auth_headers, title="Calendar Test Meeting"):
    res = client.post(
        "/meetings/upload",
        json={"title": title, "raw_transcript": TRANSCRIPT},
        headers=auth_headers,
    )
    assert res.status_code == 201
    return res.json()["id"]


def _mark_completed(db_session, meeting_id: str, meeting_date: date | None = None):
    """Set meeting to completed and optionally set meeting_date."""
    from app.models.meeting import Meeting, MeetingStatus

    meeting = db_session.get(Meeting, uuid.UUID(meeting_id))
    meeting.status = MeetingStatus.completed
    if meeting_date is not None:
        meeting.meeting_date = meeting_date
    db_session.commit()
    return meeting


def _add_decision(db_session, meeting_id: str, text: str = "Use ALB", owner: str | None = "Alice"):
    from app.models.decision import Decision

    d = Decision(
        meeting_id=uuid.UUID(meeting_id),
        text=text,
        owner=owner,
        confidence=0.9,
    )
    db_session.add(d)
    db_session.commit()
    return d


def _add_gap(db_session, meeting_id: str, description: str = "No rollback plan", risk_level: str = "high"):
    from app.models.gap import Gap

    g = Gap(
        meeting_id=uuid.UUID(meeting_id),
        description=description,
        risk_level=risk_level,
    )
    db_session.add(g)
    db_session.commit()
    return g


def _add_action(db_session, meeting_id: str, text: str = "Set up ECS", assignee: str | None = "Bob",
                due_date: date | None = None):
    from app.models.action_item import ActionItem

    a = ActionItem(
        meeting_id=uuid.UUID(meeting_id),
        text=text,
        assignee=assignee,
        depends_on=None,
        due_date=due_date,
    )
    db_session.add(a)
    db_session.commit()
    return a


def _get(client, auth_headers, start: str, end: str):
    return client.get(
        f"/meetings/calendar?start={start}&end={end}",
        headers=auth_headers,
    )


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_calendar_returns_meeting_event_using_created_at_fallback(client, auth_headers, db_session):
    """Completed meeting with no meeting_date appears on its created_at date."""
    mid = _upload(client, auth_headers)
    meeting = _mark_completed(db_session, mid)

    anchor = meeting.created_at.date()
    start = anchor.replace(day=1).isoformat()
    end = anchor.replace(day=28).isoformat()  # safe for any month

    res = _get(client, auth_headers, start, end)
    assert res.status_code == 200

    events = res.json()["events"]
    meeting_events = [e for e in events if e["type"] == "meeting" and e["meeting_id"] == mid]
    assert len(meeting_events) == 1
    assert meeting_events[0]["date"] == anchor.isoformat()
    assert meeting_events[0]["title"] == "Calendar Test Meeting"


def test_calendar_uses_explicit_meeting_date(client, auth_headers, db_session):
    """When meeting_date is set, that date is used instead of created_at."""
    mid = _upload(client, auth_headers)
    explicit = date(2026, 3, 15)
    _mark_completed(db_session, mid, meeting_date=explicit)

    res = _get(client, auth_headers, "2026-03-01", "2026-03-31")
    assert res.status_code == 200

    events = res.json()["events"]
    meeting_events = [e for e in events if e["type"] == "meeting" and e["meeting_id"] == mid]
    assert len(meeting_events) == 1
    assert meeting_events[0]["date"] == "2026-03-15"


def test_calendar_excludes_meeting_outside_date_range(client, auth_headers, db_session):
    """Meeting with meeting_date outside the query window is not returned."""
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid, meeting_date=date(2026, 1, 10))

    res = _get(client, auth_headers, "2026-03-01", "2026-03-31")
    assert res.status_code == 200

    ids = [e["meeting_id"] for e in res.json()["events"]]
    assert mid not in ids


def test_calendar_excludes_pending_meeting(client, auth_headers, db_session):
    """Meeting that is still pending is not returned."""
    mid = _upload(client, auth_headers)
    # do NOT mark completed — stays pending

    from app.models.meeting import Meeting
    meeting = db_session.get(Meeting, uuid.UUID(mid))
    anchor = meeting.created_at.date()

    res = _get(client, auth_headers,
               anchor.replace(day=1).isoformat(),
               anchor.replace(day=28).isoformat())
    assert res.status_code == 200

    ids = [e["meeting_id"] for e in res.json()["events"]]
    assert mid not in ids


def test_calendar_emits_decision_on_meeting_date(client, auth_headers, db_session):
    """Decision is emitted on the meeting's anchor date with correct meta."""
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid, meeting_date=date(2026, 5, 20))
    _add_decision(db_session, mid, text="Use ALB for routing", owner="Carol")

    res = _get(client, auth_headers, "2026-05-01", "2026-05-31")
    assert res.status_code == 200

    decisions = [e for e in res.json()["events"] if e["type"] == "decision"]
    assert len(decisions) == 1
    assert decisions[0]["date"] == "2026-05-20"
    assert decisions[0]["title"] == "Use ALB for routing"
    assert decisions[0]["meta"]["owner"] == "Carol"
    assert decisions[0]["meta"]["confidence"] == pytest.approx(0.9)


def test_calendar_emits_gap_on_meeting_date(client, auth_headers, db_session):
    """Gap is emitted on the meeting's anchor date with risk_level in meta."""
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid, meeting_date=date(2026, 5, 20))
    _add_gap(db_session, mid, description="No rollback plan defined", risk_level="high")

    res = _get(client, auth_headers, "2026-05-01", "2026-05-31")
    assert res.status_code == 200

    gaps = [e for e in res.json()["events"] if e["type"] == "gap"]
    assert len(gaps) == 1
    assert gaps[0]["date"] == "2026-05-20"
    assert gaps[0]["meta"]["risk_level"] == "high"


def test_calendar_emits_action_on_due_date(client, auth_headers, db_session):
    """Action item with due_date in range appears on its due_date, not the meeting date."""
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid, meeting_date=date(2026, 5, 1))
    _add_action(db_session, mid, text="Set up ECS task definitions",
                assignee="Bob", due_date=date(2026, 5, 15))

    res = _get(client, auth_headers, "2026-05-01", "2026-05-31")
    assert res.status_code == 200

    actions = [e for e in res.json()["events"] if e["type"] == "action"]
    assert len(actions) == 1
    assert actions[0]["date"] == "2026-05-15"
    assert actions[0]["title"] == "Set up ECS task definitions"
    assert actions[0]["meta"]["assignee"] == "Bob"


def test_calendar_omits_action_without_due_date(client, auth_headers, db_session):
    """Action items with no due_date are never emitted."""
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid, meeting_date=date(2026, 5, 10))
    _add_action(db_session, mid, text="Review logs", due_date=None)

    res = _get(client, auth_headers, "2026-05-01", "2026-05-31")
    assert res.status_code == 200

    actions = [e for e in res.json()["events"] if e["type"] == "action"]
    assert len(actions) == 0


def test_calendar_omits_action_outside_range(client, auth_headers, db_session):
    """Action item with due_date outside the query window is excluded."""
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid, meeting_date=date(2026, 5, 10))
    _add_action(db_session, mid, text="Future task", due_date=date(2026, 8, 1))

    res = _get(client, auth_headers, "2026-05-01", "2026-05-31")
    assert res.status_code == 200

    actions = [e for e in res.json()["events"] if e["type"] == "action"]
    assert len(actions) == 0


def test_calendar_events_sorted_by_date(client, auth_headers, db_session):
    """All events are returned in ascending date order."""
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid, meeting_date=date(2026, 6, 10))
    _add_decision(db_session, mid, text="Decision A")
    _add_action(db_session, mid, text="Action early", due_date=date(2026, 6, 5))
    _add_action(db_session, mid, text="Action late", due_date=date(2026, 6, 20))

    res = _get(client, auth_headers, "2026-06-01", "2026-06-30")
    assert res.status_code == 200

    dates = [e["date"] for e in res.json()["events"]]
    assert dates == sorted(dates)


def test_calendar_multiple_meetings_same_range(client, auth_headers, db_session):
    """Events from multiple meetings all appear when both are in range."""
    mid1 = _upload(client, auth_headers, title="Meeting Alpha")
    mid2 = _upload(client, auth_headers, title="Meeting Beta")
    _mark_completed(db_session, mid1, meeting_date=date(2026, 4, 5))
    _mark_completed(db_session, mid2, meeting_date=date(2026, 4, 15))

    res = _get(client, auth_headers, "2026-04-01", "2026-04-30")
    assert res.status_code == 200

    events = res.json()["events"]
    meeting_ids = {e["meeting_id"] for e in events if e["type"] == "meeting"}
    assert mid1 in meeting_ids
    assert mid2 in meeting_ids


def test_calendar_empty_range_returns_no_events(client, auth_headers, db_session):
    """Query for a month with no meetings returns empty events list."""
    res = _get(client, auth_headers, "2020-01-01", "2020-01-31")
    assert res.status_code == 200
    assert res.json()["events"] == []


def test_calendar_isolates_by_user(client, auth_headers, db_session):
    """Another user's meetings never appear in the calendar response."""
    mid = _upload(client, auth_headers)
    _mark_completed(db_session, mid, meeting_date=date(2026, 4, 10))

    # Second user registers and queries calendar
    client.post("/auth/register", json={"email": "cal_other@test.com", "password": "pw123456"})
    login = client.post("/auth/login", data={"username": "cal_other@test.com", "password": "pw123456"})
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    res = _get(client, other_headers, "2026-04-01", "2026-04-30")
    assert res.status_code == 200
    assert res.json()["events"] == []


def test_calendar_requires_auth():
    """Request without token returns 401."""
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as c:
        res = c.get("/meetings/calendar?start=2026-01-01&end=2026-01-31")
    assert res.status_code == 401


def test_calendar_missing_params(client, auth_headers):
    """Missing start or end query params returns 422 Unprocessable Entity."""
    res = client.get("/meetings/calendar?start=2026-01-01", headers=auth_headers)
    assert res.status_code == 422

    res = client.get("/meetings/calendar?end=2026-01-31", headers=auth_headers)
    assert res.status_code == 422

    res = client.get("/meetings/calendar", headers=auth_headers)
    assert res.status_code == 422


def test_calendar_meeting_title_on_all_child_events(client, auth_headers, db_session):
    """Decisions and gaps carry the parent meeting's title in meeting_title field."""
    mid = _upload(client, auth_headers, title="Infra Sync")
    _mark_completed(db_session, mid, meeting_date=date(2026, 7, 1))
    _add_decision(db_session, mid, text="Go with Fargate")
    _add_gap(db_session, mid, description="No disaster recovery plan", risk_level="medium")

    res = _get(client, auth_headers, "2026-07-01", "2026-07-31")
    assert res.status_code == 200

    child_events = [e for e in res.json()["events"] if e["type"] in ("decision", "gap")]
    for e in child_events:
        assert e["meeting_title"] == "Infra Sync"
        assert e["meeting_id"] == mid
