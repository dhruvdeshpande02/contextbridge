from openai import OpenAI

from app.core.config import settings

client = OpenAI(api_key=settings.openai_api_key)

EXTRACTION_SCHEMA = {
    "name": "meeting_extraction",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
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
                    },
                    "required": ["text", "assignee", "depends_on"],
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
        "required": ["decisions", "action_items", "gaps"],
        "additionalProperties": False,
    },
}

EXTRACTION_SYSTEM_PROMPT = """You analyze meeting transcripts for a team intelligence tool. Extract three things:
1. decisions: explicit decisions made, with an owner if named (else null) and a confidence score 0-1 reflecting how clearly the transcript states the decision.
2. action_items: concrete tasks assigned, with an assignee if named (else null) and depends_on noting any blocking item mentioned (else null).
3. gaps: risks or unresolved issues that were NOT explicitly flagged by speakers but are implied - e.g. a deadline with no owner, a disagreement left unresolved, a dependency nobody acknowledged. Rate each gap's risk_level as low, medium, or high.
Only extract what is actually supported by the transcript. Return empty arrays if nothing qualifies."""


def extract_meeting_intelligence(transcript: str) -> dict:
    response = client.chat.completions.create(
        model=settings.openai_extraction_model,
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": transcript},
        ],
        response_format={"type": "json_schema", "json_schema": EXTRACTION_SCHEMA},
    )
    import json

    return json.loads(response.choices[0].message.content)


def embed_texts(texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(model=settings.openai_embedding_model, input=texts)
    return [item.embedding for item in response.data]


def answer_with_context(question: str, context_chunks: list[str]) -> str:
    context = "\n\n---\n\n".join(context_chunks)
    response = client.chat.completions.create(
        model=settings.openai_extraction_model,
        messages=[
            {
                "role": "system",
                "content": "Answer the user's question using only the meeting excerpts provided. "
                "If the excerpts don't contain enough information, say so explicitly. Cite which "
                "excerpt(s) you used by quoting a short phrase from them.",
            },
            {"role": "user", "content": f"Meeting excerpts:\n\n{context}\n\nQuestion: {question}"},
        ],
    )
    return response.choices[0].message.content
