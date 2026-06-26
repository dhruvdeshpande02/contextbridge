"""
Tests for LLM service retry logic.
No real OpenAI calls are made — everything is mocked.
"""
import pytest
from unittest.mock import MagicMock, patch, call
from openai import APITimeoutError, RateLimitError, APIStatusError

from app.services.llm import _call_with_retry, extract_meeting_intelligence, embed_texts


# ── _call_with_retry ──────────────────────────────────────────────────────────

def test_retry_succeeds_on_first_attempt():
    fn = MagicMock(return_value="ok")
    assert _call_with_retry(fn, retries=3, backoff=0) == "ok"
    fn.assert_called_once()


def test_retry_succeeds_after_transient_failures(monkeypatch):
    monkeypatch.setattr("app.services.llm.time.sleep", lambda _: None)
    fn = MagicMock(side_effect=[APITimeoutError(request=MagicMock()), APITimeoutError(request=MagicMock()), "recovered"])
    result = _call_with_retry(fn, retries=3, backoff=0.01)
    assert result == "recovered"
    assert fn.call_count == 3


def test_retry_raises_after_max_attempts(monkeypatch):
    monkeypatch.setattr("app.services.llm.time.sleep", lambda _: None)
    exc = APITimeoutError(request=MagicMock())
    fn = MagicMock(side_effect=exc)
    with pytest.raises(APITimeoutError):
        _call_with_retry(fn, retries=3, backoff=0.01)
    assert fn.call_count == 3


def test_4xx_client_error_is_not_retried(monkeypatch):
    monkeypatch.setattr("app.services.llm.time.sleep", lambda _: None)
    response = MagicMock()
    response.status_code = 400
    exc = APIStatusError("bad request", response=response, body={})
    fn = MagicMock(side_effect=exc)
    with pytest.raises(APIStatusError):
        _call_with_retry(fn, retries=3, backoff=0.01)
    # Must not retry a 400 — only called once
    fn.assert_called_once()


def test_5xx_server_error_is_retried(monkeypatch):
    monkeypatch.setattr("app.services.llm.time.sleep", lambda _: None)
    response = MagicMock()
    response.status_code = 500
    exc = APIStatusError("server error", response=response, body={})
    fn = MagicMock(side_effect=[exc, exc, "ok"])
    result = _call_with_retry(fn, retries=3, backoff=0.01)
    assert result == "ok"
    assert fn.call_count == 3


# ── extract_meeting_intelligence ──────────────────────────────────────────────

FAKE_EXTRACTION = {
    "decisions": [{"text": "Ship by Friday", "owner": "Alice", "confidence": 0.95}],
    "action_items": [{"text": "Fix the API", "assignee": "Bob", "depends_on": None}],
    "gaps": [{"description": "No QA owner assigned", "risk_level": "high"}],
}


def test_extract_returns_parsed_dict():
    mock_response = MagicMock()
    mock_response.choices[0].message.content = (
        '{"decisions":[{"text":"Ship by Friday","owner":"Alice","confidence":0.95}],'
        '"action_items":[{"text":"Fix the API","assignee":"Bob","depends_on":null}],'
        '"gaps":[{"description":"No QA owner assigned","risk_level":"high"}]}'
    )
    with patch("app.services.llm.client.chat.completions.create", return_value=mock_response):
        result = extract_meeting_intelligence("Alice: We decided to ship by Friday.")

    assert result["decisions"][0]["owner"] == "Alice"
    assert result["decisions"][0]["confidence"] == 0.95
    assert result["action_items"][0]["assignee"] == "Bob"
    assert result["gaps"][0]["risk_level"] == "high"


def test_extract_retries_on_timeout(monkeypatch):
    monkeypatch.setattr("app.services.llm.time.sleep", lambda _: None)
    mock_response = MagicMock()
    mock_response.choices[0].message.content = (
        '{"decisions":[],"action_items":[],"gaps":[]}'
    )
    with patch("app.services.llm.client.chat.completions.create",
               side_effect=[APITimeoutError(request=MagicMock()), mock_response]) as mock_create:
        result = extract_meeting_intelligence("some transcript")
    assert result == {"decisions": [], "action_items": [], "gaps": []}
    assert mock_create.call_count == 2


# ── embed_texts ───────────────────────────────────────────────────────────────

def test_embed_returns_vectors():
    mock_response = MagicMock()
    mock_response.data = [MagicMock(embedding=[0.1, 0.2, 0.3])]
    with patch("app.services.llm.client.embeddings.create", return_value=mock_response):
        result = embed_texts(["hello world"])
    assert result == [[0.1, 0.2, 0.3]]


def test_embed_retries_on_rate_limit(monkeypatch):
    monkeypatch.setattr("app.services.llm.time.sleep", lambda _: None)
    mock_response = MagicMock()
    mock_response.data = [MagicMock(embedding=[0.5])]
    rate_exc = RateLimitError(
        message="rate limit",
        response=MagicMock(headers={"retry-after": "0.01"}),
        body={},
    )
    with patch("app.services.llm.client.embeddings.create",
               side_effect=[rate_exc, mock_response]) as mock_create:
        result = embed_texts(["test"])
    assert result == [[0.5]]
    assert mock_create.call_count == 2
