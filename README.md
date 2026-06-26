# ContextBridge

**Meeting intelligence platform.** Paste a transcript — AI extracts every decision made, action item assigned, and implicit gap left unresolved. Ask natural-language questions across all your meetings or drill into a single one.

---

## What it does

| Feature | Detail |
|---------|--------|
| **Structured extraction** | GPT-4o with strict JSON schema outputs decisions (+ owner, confidence), action items (+ assignee, blockers), and gaps (+ risk level) |
| **Gap detection** | Surfaces risks speakers did not flag themselves — unowned deadlines, unresolved disagreements, unacknowledged dependencies |
| **Cross-meeting RAG** | Ask "what keeps getting deferred?" across all your meetings; pgvector finds the relevant chunks, GPT answers from them |
| **Meeting-scoped Q&A** | Ask questions scoped to a single meeting from the detail page |
| **Async processing** | Upload returns instantly; Celery worker handles the OpenAI calls in the background |
| **LLM retry logic** | Transient OpenAI errors (timeout, rate limit, 5xx) are retried with exponential backoff |

---

## Architecture

```
Browser (Next.js 14)
        |  REST/JSON
        v
FastAPI (Uvicorn)
        |
        |--- PostgreSQL (pgvector)
        |         |-- users
        |         |-- meetings
        |         |-- decisions / action_items / gaps
        |         +-- meeting_chunks  <- 1536-dim vectors for RAG
        |
        |--- Redis  <-- Celery broker + result backend
        |
        +--- Celery Worker
                  |
                  +--- OpenAI API
                            |-- gpt-4o-mini  (extraction + Q&A)
                            +-- text-embedding-3-small  (vectors)
```

### Request lifecycle: upload

```
POST /meetings/upload
  -> create Meeting row (status=pending)
  -> enqueue process_meeting_task via Celery
  -> return 201 immediately

[Celery worker picks up task]
  -> status = processing
  -> extract_meeting_intelligence(transcript)   <- GPT, strict JSON schema
  -> write decisions / action_items / gaps to DB
  -> chunk_text(transcript)                     <- overlapping chunks
  -> embed_texts(chunks)                        <- OpenAI embeddings
  -> write MeetingChunk rows (pgvector)
  -> status = completed  (or failed on error)
```

### Request lifecycle: Ask AI (RAG)

```
POST /meetings/query          (cross-meeting)
POST /meetings/{id}/ask       (single-meeting)
  -> embed_texts([question])
  -> cosine similarity search on meeting_chunks via pgvector
  -> answer_with_context(question, top_5_chunks)   <- GPT with grounding
  -> return answer  (+ source meeting IDs for cross-meeting)
```

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| API | FastAPI | Async, typed, auto-docs at `/docs` |
| ORM | SQLAlchemy 2.0 | Mature, explicit, good pgvector support |
| Vector search | pgvector | No extra infra; vectors live in the same Postgres instance |
| Async tasks | Celery + Redis | Decouples slow OpenAI calls from HTTP responses; tasks survive restarts |
| LLM extraction | OpenAI structured outputs (`strict: true`) | Guarantees schema-valid JSON; no output-parsing hacks |
| Embeddings | `text-embedding-3-small` | Fast, cheap, 1536 dims, strong semantic quality |
| Frontend | Next.js 14 App Router + Tailwind | Modern React stack; SSR-ready |
| Auth | JWT (python-jose) + bcrypt | Stateless, standard |

### Key design decisions

**Why pgvector instead of a dedicated vector DB?**
One less service to run. For thousands of meetings per user (not millions), pgvector's cosine index is fast enough, and keeping vectors in the same DB as structured data means one transaction boundary and no sync issues.

**Why Celery instead of FastAPI `BackgroundTasks`?**
`BackgroundTasks` dies if the process restarts mid-job. Celery tasks survive restarts, can be retried, and scale horizontally by adding workers. The cost is one Redis instance.

**Why `strict: True` on the JSON schema?**
Without it, GPT sometimes adds commentary, renames fields, or returns malformed JSON. Strict mode enforces the exact schema at the API level — the response either matches or the call raises, triggering a retry. This makes the extraction pipeline reliable enough to run unattended.

**Why overlapping chunks for embeddings?**
A decision spanning a chunk boundary would be missed without overlap. Overlapping by ~20% ensures context is never split at an awkward point.

---

## Running locally

### Prerequisites

- Docker Desktop
- An OpenAI API key

### 1. Clone and configure

```bash
git clone https://github.com/your-handle/contextbridge.git
cd contextbridge
cp .env.example .env
# open .env and set OPENAI_API_KEY
```

### 2. Start the stack

```bash
docker compose up --build
```

Five services start:

| Service | Port | Description |
|---------|------|-------------|
| `api` | 8000 | FastAPI + Uvicorn |
| `worker` | — | Celery worker (same image as api) |
| `db` | 5433 | Postgres 16 + pgvector |
| `redis` | 6379 | Celery broker |
| `frontend` | 3000 | Next.js 14 |

### 3. Run migrations

```bash
docker compose exec api alembic upgrade head
```

### 4. Open the app

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs

### Running the frontend separately (faster dev HMR)

```bash
docker compose stop frontend
cd frontend
npm install
npm run dev   # http://localhost:3000
```

---

## Running tests

Tests use a real Postgres instance (the Docker stack) but an isolated `contextbridge_test` database that is created and destroyed each test session. No real OpenAI calls are made.

```bash
# Ensure DB is running
docker compose up -d db

# Run from inside the container
docker compose exec api pytest -v

# Or from your machine (with DB port forwarded)
pip install -r requirements.txt
pytest -v
```

### Test coverage

| File | What is tested |
|------|---------------|
| `test_auth.py` | Register, login, duplicate email, wrong password, protected route guard |
| `test_meetings.py` | Upload, Celery task dispatch, list isolation between users, 404 on wrong owner, empty list on pending meeting |
| `test_ask.py` | Meeting-scoped Q&A: happy path, 400 on unprocessed, 404 on wrong user, 404 on nonexistent, 401 without token |
| `test_llm.py` | Retry logic: succeeds first try, recovers after transient failures, raises after max retries, 4xx not retried, 5xx retried; extract and embed mocked end-to-end |

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | — | `postgresql://user:pass@host:port/db` |
| `REDIS_URL` | yes | — | `redis://host:port/0` |
| `SECRET_KEY` | yes | — | Random string for JWT signing |
| `OPENAI_API_KEY` | yes | — | Your OpenAI key |
| `OPENAI_EXTRACTION_MODEL` | no | `gpt-4o-mini` | Model used for extraction and Q&A |
| `OPENAI_EMBEDDING_MODEL` | no | `text-embedding-3-small` | Model used for embeddings |

---

## API reference

Full interactive docs at `/docs` when the server is running.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Get JWT token |
| POST | `/meetings/upload` | yes | Upload transcript, enqueue processing |
| GET | `/meetings` | yes | List your meetings |
| GET | `/meetings/{id}` | yes | Get single meeting + status |
| GET | `/meetings/{id}/decisions` | yes | Extracted decisions with confidence |
| GET | `/meetings/{id}/actions` | yes | Extracted action items with assignees |
| GET | `/meetings/{id}/gaps` | yes | Detected gaps with risk levels |
| POST | `/meetings/{id}/ask` | yes | Q&A scoped to one meeting |
| POST | `/meetings/query` | yes | Q&A across all meetings |

---

## Project structure

```
contextbridge/
├── app/
│   ├── api/
│   │   ├── auth.py             # /auth routes
│   │   └── meetings.py         # /meetings routes
│   ├── core/
│   │   ├── config.py           # env var settings (Pydantic)
│   │   ├── database.py         # SQLAlchemy engine + session
│   │   ├── security.py         # JWT create/verify
│   │   ├── deps.py             # get_current_user FastAPI dependency
│   │   └── celery_app.py       # Celery instance
│   ├── models/                 # SQLAlchemy ORM models
│   ├── schemas/                # Pydantic request/response shapes
│   ├── services/
│   │   ├── llm.py              # All OpenAI calls + retry logic
│   │   └── chunking.py         # Transcript chunking for embeddings
│   └── tasks/
│       └── process_meeting.py  # Celery task: extract + embed
├── alembic/                    # DB migrations
├── tests/
│   ├── conftest.py             # Test DB setup, fixtures, auth helpers
│   ├── test_auth.py
│   ├── test_meetings.py
│   ├── test_ask.py
│   └── test_llm.py
├── frontend/                   # Next.js 14 app
│   ├── app/                    # Pages (App Router)
│   ├── components/             # Sidebar, logo, status badges, etc.
│   └── lib/                    # API client, auth token helpers
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```
