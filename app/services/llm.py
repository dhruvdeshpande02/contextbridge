import json
import logging
import time
from datetime import datetime, timezone

from openai import OpenAI, APITimeoutError, APIConnectionError, RateLimitError, APIStatusError

from app.core.config import settings

logger = logging.getLogger(__name__)

client = OpenAI(api_key=settings.openai_api_key)

EXTRACTION_SCHEMA = {
    "name": "meeting_extraction",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "meeting_date": {"type": ["string", "null"]},
            "decisions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "owner": {"type": ["string", "null"]},
                        "confidence": {"type": "number"},
                    },
                    "required": ["text", "owner", "confidence"],
                    "additionalProperties": False,
                },
            },
            "action_items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "assignee": {"type": ["string", "null"]},
                        "depends_on": {"type": ["string", "null"]},
                        "due_date": {"type": ["string", "null"]},
                    },
                    "required": ["text", "assignee", "depends_on", "due_date"],
                    "additionalProperties": False,
                },
            },
            "gaps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "description": {"type": "string"},
                        "risk_level": {"type": "string", "enum": ["low", "medium", "high"]},
                    },
                    "required": ["description", "risk_level"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["meeting_date", "decisions", "action_items", "gaps"],
        "additionalProperties": False,
    },
}

def _extraction_system_prompt() -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return (
        f"Today's date is {today}. "
        "You analyze meeting transcripts for a team intelligence tool. Extract:\n"
        "1. meeting_date: the date the meeting took place, as ISO-8601 (YYYY-MM-DD). "
        "Infer from explicit dates in the transcript (e.g. 'Monday June 23rd', '2026-06-27'). "
        "If only a weekday or relative phrase is given (e.g. 'last Thursday'), resolve it relative to today's date. "
        "Return null if not determinable.\n"
        "2. decisions: explicit decisions made, with an owner if named (else null) and a confidence score "
        "0-1 reflecting how clearly the transcript states the decision.\n"
        "3. action_items: concrete tasks assigned, with an assignee if named (else null), depends_on noting "
        "any blocking item mentioned (else null), and due_date as ISO-8601 if a deadline is mentioned "
        "(e.g. 'by July 8th', 'end of sprint') — resolve relative to today's date — else null.\n"
        "4. gaps: risks or unresolved issues that were NOT explicitly flagged by speakers but are implied — "
        "e.g. a deadline with no owner, a disagreement left unresolved, a dependency nobody acknowledged. "
        "Rate each gap's risk_level as low, medium, or high.\n"
        "Only extract what is actually supported by the transcript. Return empty arrays if nothing qualifies."
    )

# Errors that are safe to retry (transient). 4xx client errors are not retried.
_RETRYABLE = (APITimeoutError, APIConnectionError, RateLimitError)


def _call_with_retry(fn, *, retries: int = 3, backoff: float = 2.0):
    """
    Call fn(), retrying on transient OpenAI errors with exponential backoff.
    RateLimitError uses the retry-after header when available.
    Raises the last exception if all attempts fail.
    """
    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            return fn()
        except _RETRYABLE as exc:
            last_exc = exc
            wait = backoff ** attempt
            # Honour the retry-after header from rate-limit responses
            if isinstance(exc, RateLimitError) and hasattr(exc, "response"):
                try:
                    wait = float(exc.response.headers.get("retry-after", wait))
                except (TypeError, ValueError):
                    pass
            logger.warning("OpenAI transient error (attempt %d/%d): %s — retrying in %.1fs", attempt, retries, exc, wait)
            time.sleep(wait)
        except APIStatusError as exc:
            # 5xx server errors are retryable; 4xx are not (bad request, auth, etc.)
            if exc.status_code >= 500:
                last_exc = exc
                wait = backoff ** attempt
                logger.warning("OpenAI server error %d (attempt %d/%d) — retrying in %.1fs", exc.status_code, attempt, retries, wait)
                time.sleep(wait)
            else:
                raise
    raise last_exc


def extract_meeting_intelligence(transcript: str) -> dict:
    def _call():
        response = client.chat.completions.create(
            model=settings.openai_extraction_model,
            messages=[
                {"role": "system", "content": _extraction_system_prompt()},
                {"role": "user", "content": transcript},
            ],
            response_format={"type": "json_schema", "json_schema": EXTRACTION_SCHEMA},
            timeout=60,
        )
        return json.loads(response.choices[0].message.content)

    return _call_with_retry(_call)


def embed_texts(texts: list[str]) -> list[list[float]]:
    def _call():
        response = client.embeddings.create(
            model=settings.openai_embedding_model,
            input=texts,
            timeout=30,
        )
        return [item.embedding for item in response.data]

    return _call_with_retry(_call)


def answer_with_context(question: str, context_chunks: list[str], metadata: str = "") -> str:
    context = "\n\n---\n\n".join(context_chunks)
    metadata_block = f"Meeting database summary:\n{metadata}\n\n" if metadata else ""

    def _call():
        response = client.chat.completions.create(
            model=settings.openai_extraction_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a meeting intelligence assistant. "
                        "Answer the user's question using the meeting database summary and excerpts provided. "
                        "Use the database summary for counting, listing, or date-related questions. "
                        "Use the excerpts for content questions. "
                        "If the information isn't available, say so explicitly."
                    ),
                },
                {
                    "role": "user",
                    "content": f"{metadata_block}Meeting excerpts:\n\n{context}\n\nQuestion: {question}",
                },
            ],
            timeout=60,
        )
        return response.choices[0].message.content

    return _call_with_retry(_call)
