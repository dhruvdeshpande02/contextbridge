import uuid
from unittest.mock import patch

TRANSCRIPT = "Alice: We decided to ship by Friday. Bob will own the backend."


def test_upload_meeting_returns_pending(client, auth_headers):
    res = client.post("/meetings/upload", json={"title": "Sprint Sync", "raw_transcript": TRANSCRIPT}, headers=auth_headers)
    assert res.status_code == 201
    body = res.json()
    assert body["title"] == "Sprint Sync"
    assert body["status"] == "pending"
    assert "id" in body


def test_upload_triggers_celery_task(client, auth_headers):
    with patch("app.api.meetings.process_meeting_task.delay") as mock_delay:
        res = client.post("/meetings/upload", json={"title": "Test", "raw_transcript": TRANSCRIPT}, headers=auth_headers)
        assert res.status_code == 201
        mock_delay.assert_called_once_with(res.json()["id"])


def test_list_meetings_returns_own_meetings_only(client, auth_headers):
    client.post("/meetings/upload", json={"title": "M1", "raw_transcript": TRANSCRIPT}, headers=auth_headers)
    client.post("/meetings/upload", json={"title": "M2", "raw_transcript": TRANSCRIPT}, headers=auth_headers)

    res = client.get("/meetings", headers=auth_headers)
    assert res.status_code == 200
    titles = [m["title"] for m in res.json()]
    assert "M1" in titles
    assert "M2" in titles


def test_list_meetings_empty_for_new_user(client):
    client.post("/auth/register", json={"email": "fresh@test.com", "password": "pw123456"})
    login = client.post("/auth/login", data={"username": "fresh@test.com", "password": "pw123456"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    res = client.get("/meetings", headers=headers)
    assert res.status_code == 200
    assert res.json() == []


def test_decisions_returns_404_for_wrong_user(client, auth_headers):
    # Upload as user A
    upload = client.post("/meetings/upload", json={"title": "Private", "raw_transcript": TRANSCRIPT}, headers=auth_headers)
    meeting_id = upload.json()["id"]

    # Try to access as user B
    client.post("/auth/register", json={"email": "other@test.com", "password": "pw123456"})
    login = client.post("/auth/login", data={"username": "other@test.com", "password": "pw123456"})
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    res = client.get(f"/meetings/{meeting_id}/decisions", headers=other_headers)
    assert res.status_code == 404  # not visible to other users


def test_decisions_actions_gaps_return_empty_list_when_pending(client, auth_headers):
    upload = client.post("/meetings/upload", json={"title": "Pending", "raw_transcript": TRANSCRIPT}, headers=auth_headers)
    mid = upload.json()["id"]
    for endpoint in ["decisions", "actions", "gaps"]:
        res = client.get(f"/meetings/{mid}/{endpoint}", headers=auth_headers)
        assert res.status_code == 200
        assert res.json() == []


def test_unknown_meeting_id_returns_404(client, auth_headers):
    fake_id = str(uuid.uuid4())
    res = client.get(f"/meetings/{fake_id}/decisions", headers=auth_headers)
    assert res.status_code == 404
