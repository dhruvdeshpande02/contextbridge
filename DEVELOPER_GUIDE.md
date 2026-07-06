# ContextBridge — Developer Guide

Welcome. This doc is written for someone who has repo access and needs to get from "I can clone this" to "I can confidently ship a change" without having to reverse-engineer the codebase from scratch. It goes deeper than the [README](./README.md) — read that first for the elevator pitch, then use this for the actual mechanics.

**Repo:** https://github.com/dhruvdeshpande02/contextbridge

---

## Table of contents

1. [What this thing does](#1-what-this-thing-does)
2. [High-level architecture](#2-high-level-architecture)
3. [Repository layout](#3-repository-layout)
4. [Database schema](#4-database-schema)
5. [Backend code tour](#5-backend-code-tour)
6. [API reference](#6-api-reference)
7. [Frontend code tour](#7-frontend-code-tour)
8. [The processing pipeline, end to end](#8-the-processing-pipeline-end-to-end)
9. [Local development setup](#9-local-development-setup)
10. [Testing](#10-testing)
11. [Infrastructure & deployment](#11-infrastructure--deployment)
12. [CI/CD](#12-cicd)
13. [Key design decisions (the "why")](#13-key-design-decisions-the-why)
14. [Known quirks / things that will trip you up](#14-known-quirks--things-that-will-trip-you-up)
15. [Common tasks — where to start](#15-common-tasks--where-to-start)

---

## 1. What this thing does

ContextBridge is a **meeting intelligence platform**. A user pastes or uploads a meeting transcript; an AI pipeline extracts three things from it:

- **Decisions** — explicit choices made, with an owner (if named) and a confidence score
- **Action items** — concrete tasks assigned, with an assignee, a blocking dependency (if any), and a due date
- **Gaps** — risks or unresolved issues that were *never explicitly flagged by speakers* but are implied (an unowned deadline, a disagreement nobody circled back on, a dependency nobody acknowledged)

On top of that, the user can ask natural-language questions — either scoped to one meeting, or across every meeting they've uploaded (cross-meeting RAG via pgvector similarity search). Both Q&A paths stream their answer back token-by-token.

There's also a calendar view (meetings/decisions/gaps/actions plotted by date) and a first-run guided product tour.

---

## 2. High-level architecture

```
Browser (Next.js 14, App Router)
        │  REST/JSON + SSE (Server-Sent Events)
        ▼
FastAPI (Uvicorn)
        │
        ├── PostgreSQL 16 + pgvector extension
        │     ├─ users, meetings, decisions, action_items, gaps
        │     └─ meeting_chunks  (1536-dim vectors, for RAG)
        │
        ├── Redis
        │     ├─ Celery broker + result backend
        │     └─ slowapi rate-limit counters
        │
        └── Celery Worker (separate process, same codebase/image)
                 │
                 └── OpenAI API
                       ├─ gpt-4o-mini            (extraction + Q&A)
                       └─ text-embedding-3-small (vectors, 1536 dims)
```

Five services run locally via Docker Compose: `api`, `worker`, `db`, `redis`, `frontend`. In production a sixth (`nginx`) can front the stack — see [§11](#11-infrastructure--deployment).

**Why a separate worker instead of `BackgroundTasks`?** FastAPI's built-in `BackgroundTasks` runs in-process and dies if the process restarts mid-job. Celery tasks survive restarts, can be retried, and scale horizontally by adding worker replicas. The cost is running one more service (Redis), which the app already needs for rate limiting anyway.

---

## 3. Repository layout

```
contextbridge/
├── app/                          # FastAPI backend
│   ├── api/
│   │   ├── auth.py               # /auth routes (register, login)
│   │   └── meetings.py           # /meetings routes — the bulk of the API (426 lines)
│   ├── core/
│   │   ├── config.py             # Settings (env vars), pydantic-settings
│   │   ├── database.py           # SQLAlchemy engine + session factory
│   │   ├── security.py           # JWT create/verify, bcrypt hashing
│   │   ├── deps.py               # get_current_user FastAPI dependency
│   │   ├── celery_app.py         # Celery app instance
│   │   └── rate_limit.py         # slowapi Limiter (Redis-backed)
│   ├── models/                   # SQLAlchemy ORM models (one file per table)
│   ├── schemas/                  # Pydantic request/response shapes
│   ├── services/
│   │   ├── llm.py                # Every OpenAI call lives here, + retry logic
│   │   ├── chunking.py           # Token-based transcript chunking for embeddings
│   │   └── transcript_parser.py  # .vtt / .txt / .docx → plain text
│   └── tasks/
│       └── process_meeting.py    # The Celery task: extract → persist → chunk → embed
├── alembic/                      # DB migrations (3 so far — see §4)
├── tests/                        # pytest suite, 51 tests (see §10)
├── frontend/                     # Next.js 14 app (see §7)
├── infra/
│   ├── nginx.conf                # Reverse proxy config for prod (TLS + routing)
│   ├── deploy.sh                 # Manual deploy script (pull, build, migrate)
│   └── setup_ec2.sh              # One-time EC2 bootstrap (installs Docker)
├── .github/workflows/
│   ├── ci.yml                    # Lightweight: builds the api image, smoke-tests import
│   └── deploy.yml                # Full test suite → SSH deploy to EC2 on push to main
├── docker-compose.yml            # Local dev stack (5 services, no nginx)
├── docker-compose.prod.yml       # Prod stack (adds nginx, uses .env, restart policies)
├── Dockerfile                    # API + worker image (same image, different command)
├── requirements.txt
└── README.md
```

---

## 4. Database schema

Three migrations so far, applied in order:

| Revision | File | What it does |
|---|---|---|
| `ef701521675a` | `initial_schema.py` | Creates `users`, `meetings`, `action_items`, `decisions`, `gaps` |
| `adb157b2c243` | `add_meeting_chunks_for_rag.py` | Adds `meeting_chunks` (with a `pgvector` `VECTOR(1536)` column) |
| `c3f892a1d047` | `add_calendar_dates.py` | Adds `meetings.meeting_date` and `action_items.due_date` |

### Tables (as currently defined in `app/models/`)

**`users`**
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `email` | String | unique, indexed |
| `hashed_password` | String | bcrypt |

**`meetings`**
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users.id) | |
| `title` | String | |
| `raw_transcript` | Text | the full pasted/uploaded text |
| `status` | Enum: `pending`/`processing`/`completed`/`failed` | |
| `created_at` | DateTime (tz-aware) | defaults to `now(UTC)` |
| `meeting_date` | Date, nullable | explicit or AI-inferred; falls back to `created_at.date()` when null |

Relationships: `decisions`, `action_items`, `gaps`, `chunks` — all `cascade="all, delete-orphan"`, so deleting a meeting cleans up everything under it.

**`decisions`** — `id`, `meeting_id` (FK), `text`, `owner` (nullable), `confidence` (float, app-level default `0.0`)

**`action_items`** — `id`, `meeting_id` (FK), `text`, `assignee` (nullable), `depends_on` (nullable string describing a blocker), `due_date` (nullable)

**`gaps`** — `id`, `meeting_id` (FK), `description`, `risk_level` (string: `"low"`/`"medium"`/`"high"`, app-level default `"medium"`)

**`meeting_chunks`** — `id`, `meeting_id` (FK), `chunk_index` (int, order within the transcript), `text`, `embedding` (`pgvector` `Vector(1536)`)

None of the risk/status/confidence fields are DB-level enums or constraints beyond `MeetingStatus` — `risk_level` and `depends_on` are plain strings, not enforced at the schema level. If you need to add a new status or risk tier, it's a Python-level change plus a migration for the `status` enum specifically (`MeetingStatus`), but a no-op migration for the string fields.

---

## 5. Backend code tour

### `app/core/` — the plumbing

- **`config.py`** — one `Settings` class (pydantic-settings), reads from `.env`. Fields: `database_url`, `redis_url`, `secret_key`, `algorithm`, `access_token_expire_minutes`, `openai_api_key`, `openai_extraction_model`, `openai_embedding_model`, `rate_limit_enabled`, `cors_origins` (comma-separated string, with a `.cors_origins_list` property that splits it). `settings = Settings()` is instantiated once at import time and imported everywhere else — there's no dependency injection for config, it's a plain module-level singleton.
- **`database.py`** — `engine`, `SessionLocal`, `Base`, and the `get_db()` FastAPI dependency (yields a session, closes it in `finally`).
- **`security.py`** — `hash_password` / `verify_password` (bcrypt via passlib), `create_access_token` / `decode_access_token` (JWT via python-jose).
- **`deps.py`** — `get_current_user`: decodes the bearer token, loads the `User` row, raises 401 if anything's wrong. Used as `Depends(get_current_user)` on every protected route.
- **`celery_app.py`** — the `Celery` instance, pointed at Redis for both broker and result backend.
- **`rate_limit.py`** — the `slowapi` `Limiter`, backed by the same Redis instance, `default_limits=["100/minute"]`, `swallow_errors=True` (so a Redis outage degrades to "unlimited" instead of a 500 on every request), `enabled=settings.rate_limit_enabled` (forced `false` in tests via `conftest.py`).

### `app/models/` — one file per table, described in [§4](#4-database-schema).

### `app/schemas/` — Pydantic I/O shapes

- **`auth.py`**: `UserCreate` (email, password), `UserOut` (id, email), `Token` (access_token, token_type).
- **`meeting.py`**: `MeetingUpload`, `MeetingOut`, `DecisionOut`, `ActionItemOut`, `GapOut`, `MeetingQuery` (just `{question: str}`, shared by both ask and query endpoints), `MeetingQueryOut` (answer + source meeting IDs), `MeetingAskOut` (answer only), `CalendarEvent` / `CalendarOut` (the unified calendar feed — `type` is a `Literal["meeting","action","decision","gap"]`, with a free-form `meta` dict for type-specific extras like `risk_level` or `assignee`).

### `app/services/llm.py` — every OpenAI call, in one place

- `extract_meeting_intelligence(transcript)` — the extraction call. Uses OpenAI's structured outputs (`response_format={"type": "json_schema", "json_schema": EXTRACTION_SCHEMA, "strict": True}`). Strict mode means the response either matches the schema exactly or the call raises — no ad-hoc JSON parsing of free text.
- `embed_texts(texts)` — batched embedding calls.
- `answer_with_context(question, chunks, metadata="")` / `stream_answer_with_context(...)` — the Q&A call, non-streaming and streaming variants, sharing a `_answer_messages()` helper so the prompt can't drift between the two.
- `_call_with_retry(fn, retries=3, backoff=2.0)` — wraps every OpenAI call. Retries `APITimeoutError`, `APIConnectionError`, `RateLimitError` (honoring the `Retry-After` header when present), and 5xx `APIStatusError`s with exponential backoff. 4xx errors are **not** retried — they raise immediately. For the streaming path, only the *opening* of the stream is retried; once tokens have started reaching the client, a retry would mean silently duplicating output, so a mid-stream failure just ends the generator and the caller (the API route) turns that into an `{"type": "error"}` SSE frame.

### `app/services/chunking.py`

Token-based chunking via `tiktoken` (`cl100k_base` encoding), 300 tokens per chunk with 50 tokens of overlap between consecutive chunks — so a decision or fact that straddles a chunk boundary doesn't get silently dropped from the embedding index.

### `app/services/transcript_parser.py`

Turns an uploaded file into plain text based on its extension:
- `.txt` — decoded as-is
- `.vtt` — strips the `WEBVTT` header, cue-identifier numbers, and timestamp lines, keeping only speaker-attributed content lines
- `.docx` — reads paragraph text via `python-docx`

### `app/tasks/process_meeting.py` — the Celery task

`process_meeting_task(meeting_id)`:
1. Loads the `Meeting`, flips status to `processing`, commits (so the frontend's polling immediately sees the state change).
2. Calls `extract_meeting_intelligence`. If the transcript didn't come with an explicit `meeting_date`, tries to backfill it from the model's inferred date.
3. Writes `Decision` / `ActionItem` / `Gap` rows.
4. Chunks the transcript, embeds the chunks, writes `MeetingChunk` rows.
5. Sets status to `completed`. **Any exception anywhere in steps 2–4 sets status to `failed` and re-raises** (the `finally: db.commit()` still persists whatever was written before the failure, plus the `failed` status).

### `app/api/auth.py` (33 lines)

Two routes: `POST /auth/register`, `POST /auth/login` — both rate-limited at `10/minute`.

### `app/api/meetings.py` (426 lines — the bulk of the backend)

Everything meeting-related lives here. See [§6](#6-api-reference) for the full route list. Worth knowing going in:

- `_get_owned_meeting(meeting_id, db, user)` — the shared "load this meeting, 404 if it doesn't exist or belongs to someone else" helper, used by nearly every meeting-scoped route. This is the authorization boundary — there's no row-level security at the DB layer, it's enforced here in Python on every single query.
- `_sse(payload: dict)` — formats one Server-Sent-Events frame (`f"data: {json.dumps(payload)}\n\n"`), used by both streaming endpoints.
- The calendar endpoint (`get_calendar`) filters by date **in SQL** (`func.coalesce(meeting_date, func.date(created_at))` compared against the query range), not by loading everything and filtering in Python — see [§13](#13-key-design-decisions-the-why) for why that distinction mattered enough to be a dedicated fix.

---

## 6. API reference

Auth routes have no `/meetings` prefix; everything else is under `/meetings`. "Auth" column: whether a bearer token is required.

| Method | Path | Auth | Rate limit | Purpose |
|---|---|---|---|---|
| POST | `/auth/register` | — | 10/min | Create account |
| POST | `/auth/login` | — | 10/min | OAuth2 password flow → JWT |
| POST | `/meetings/upload` | yes | 30/hour | Upload via pasted text, enqueue processing |
| POST | `/meetings/upload-file` | yes | 30/hour | Upload via `.vtt`/`.txt`/`.docx` file |
| GET | `/meetings` | yes | 100/min (default) | List the caller's meetings |
| GET | `/meetings/{id}` | yes | 100/min | Single meeting + status |
| GET | `/meetings/{id}/decisions` | yes | 100/min | Extracted decisions |
| GET | `/meetings/{id}/actions` | yes | 100/min | Extracted action items |
| GET | `/meetings/{id}/gaps` | yes | 100/min | Detected gaps |
| GET | `/meetings/undated-actions` | yes | 100/min | Action items with no `due_date`, across all completed meetings |
| GET | `/meetings/calendar` | yes | 100/min | Unified feed of meetings/decisions/gaps/actions in a `start`–`end` date range |
| POST | `/meetings/reprocess-dates` | yes | 100/min | Re-queue all completed meetings missing a `meeting_date` |
| POST | `/meetings/{id}/reprocess` | yes | 100/min | Reset a `failed` meeting to `pending` and re-queue it (deletes stale child rows first) |
| POST | `/meetings/{id}/ask` | yes | 20/min | Meeting-scoped Q&A, full answer in one response |
| POST | `/meetings/{id}/ask/stream` | yes | 20/min | Same, streamed as SSE (`token`/`done`/`error` frames) |
| POST | `/meetings/query` | yes | 20/min | Cross-meeting Q&A, full answer in one response |
| POST | `/meetings/query/stream` | yes | 20/min | Same, streamed as SSE (`sources`/`token`/`done`/`error` frames) |

Interactive Swagger docs are auto-generated at `/docs` whenever the API is running.

**SSE frame shapes** (both streaming endpoints):
```
data: {"type": "sources", "sources": ["<meeting-uuid>", ...]}   ← query/stream only, sent first
data: {"type": "token", "text": "..."}                          ← repeated, one per token
data: {"type": "error", "message": "..."}                       ← only on failure
data: {"type": "done"}                                          ← always sent last
```

Exceeding a rate limit returns `429` with body `{"error": "Rate limit exceeded: <limit>"}`.

---

## 7. Frontend code tour

Next.js 14, App Router, Tailwind, TanStack Query for data fetching. No global state library — auth token lives in `localStorage` via `lib/auth.ts`, server data is fetched per-page via TanStack Query.

```
frontend/
├── app/
│   ├── page.tsx                  # "/" — just redirects to /dashboard or /login based on auth.isLoggedIn()
│   ├── layout.tsx                # Root layout: QueryClientProvider + WalkthroughProvider/Overlay/WelcomeGate
│   ├── (auth)/
│   │   ├── login/page.tsx        # Split-screen branding + form; branding hides on mobile
│   │   └── register/page.tsx     # Same pattern
│   ├── dashboard/page.tsx        # Meeting list, polls every 5s while any meeting is processing
│   ├── meetings/
│   │   ├── upload/page.tsx       # Paste-text or drag-drop-file upload form
│   │   └── [id]/page.tsx         # Meeting detail: Decisions/Actions/Gaps/Ask tabs
│   ├── calendar/page.tsx         # Month grid + day-detail panel + undated-actions drawer
│   └── query/page.tsx            # Cross-meeting Ask AI page
├── components/
│   ├── sidebar.tsx                # THE nav component — desktop floating sidebar + mobile top/bottom bars
│   ├── navbar.tsx                 # ⚠️ DEAD CODE — see §14, not imported anywhere
│   ├── status-badge.tsx           # Pending/processing/completed/failed pill
│   ├── confidence-bar.tsx         # The decision confidence progress bar
│   ├── brain-illustration.tsx     # SVG logo components (BridgeLogo, SmallBrainIcon)
│   ├── walkthrough/
│   │   ├── walkthrough-context.tsx   # State machine: active/stepIndex, start/next/prev/skip
│   │   ├── walkthrough-overlay.tsx   # The actual spotlight + tooltip UI
│   │   └── welcome-gate.tsx          # First-visit "take the tour?" modal
│   └── ui/
│       ├── button.tsx             # Used everywhere
│       ├── input.tsx              # Input + Textarea
│       └── card.tsx               # ⚠️ DEAD CODE — see §14, not imported anywhere
└── lib/
    ├── api.ts                     # Every backend call lives here — the only file that knows about fetch()
    ├── auth.ts                    # localStorage token get/set/clear/isLoggedIn
    ├── utils.ts                   # `cn()` — clsx + tailwind-merge, standard shadcn-style helper
    └── walkthrough-steps.ts       # The tour's step definitions (target selector, copy, placement)
```

### `lib/api.ts` — the API client

Every backend call goes through here — pages never call `fetch()` directly. Two shapes:

- **Plain JSON calls** (`request<T>()`) — attaches the bearer token, throws on non-2xx with the backend's `detail` message.
- **Streaming calls** (`streamSSE()`) — used by `streamAskMeeting()` and `streamQueryMeetings()`. Deliberately **not** `EventSource`, because `EventSource` can't send a POST body or an `Authorization` header. Instead it's `fetch()` + manually reading `response.body.getReader()`, buffering partial chunks across reads and splitting on `\n\n` to find complete SSE frames.

The non-streaming `askMeeting`/`queryMeetings` client functions were removed once the UI switched to streaming — the backend routes still exist and are still tested, just nothing in the frontend calls them anymore.

### The walkthrough system

Three pieces working together:
- `WalkthroughProvider` (context) holds `{active, stepIndex}` and exposes `start/next/prev/skip`. Navigation between pages is a **side effect** of `stepIndex` changing (a `useEffect` watching `[active, stepIndex]`), not something the click handlers do directly — this was a deliberate fix after an earlier version called `router.push` from inside a state updater, which React can invoke during render and which triggered a "cannot update a component while rendering" warning.
- `WalkthroughOverlay` finds the current step's target element via `data-tour="..."` attributes, draws a spotlight cutout (a box-shadow trick: a transparent box with `box-shadow: 0 0 0 9999px rgba(...)` darkens everything except the cutout), and positions a tooltip near it — falling back to centered if there's no target, and adaptively flipping left/right placement to top/bottom if there isn't room (relevant on mobile).
- Since the mobile bottom-tab-bar and desktop sidebar both have `data-tour="nav-meetings"` etc. (one is always `display: none` depending on viewport), the overlay's target-finding logic uses `querySelectorAll` + picks whichever match has a non-zero bounding box, rather than blindly grabbing the first DOM match.

### Mobile responsiveness

Below the `md` Tailwind breakpoint, `Sidebar` renders a fixed top bar (logo + overflow menu for Help/Logout) and a fixed bottom tab bar (Meetings/Calendar/Ask AI) instead of the desktop floating panel. Every page's `<main>` padding is responsive to leave room for those bars. Two-column layouts (upload page, calendar page) stack vertically below `md`.

---

## 8. The processing pipeline, end to end

**Upload:**
```
POST /meetings/upload (or /upload-file)
  → create Meeting row, status="pending"
  → process_meeting_task.delay(meeting_id)   [Celery, async]
  → return 201 immediately — the frontend redirects to the meeting detail page
```

**In the worker:**
```
status → "processing" (committed immediately, so polling clients see it)
extract_meeting_intelligence(transcript)     — GPT call, strict JSON schema
  → write Decision / ActionItem / Gap rows
chunk_text(transcript)                        — tiktoken, 300 tok / 50 tok overlap
embed_texts(chunks)                           — OpenAI embeddings, batched
  → write MeetingChunk rows (with vectors)
status → "completed"  (or "failed" if any step above raised)
```

The frontend's meeting detail page polls `GET /meetings/{id}` every 3 seconds while status is `pending`/`processing` (via TanStack Query's `refetchInterval`), and stops polling once it hits a terminal state.

**Asking a question (streaming):**
```
POST /meetings/{id}/ask/stream  or  /meetings/query/stream
  → embed the question
  → pgvector cosine-distance search, top 5 chunks (scoped to one meeting, or across
    all of the user's meetings for the cross-meeting variant)
  → [cross-meeting only] send a `sources` SSE frame with the contributing meeting IDs
  → open the OpenAI chat completion with stream=True
  → forward each token as a `token` SSE frame as it arrives
  → send a `done` frame when the stream ends (or an `error` frame if it broke mid-stream)
```

---

## 9. Local development setup

**Prerequisites:** Docker Desktop, an OpenAI API key.

```bash
git clone https://github.com/dhruvdeshpande02/contextbridge.git
cd contextbridge
cp .env.example .env
# edit .env — at minimum set OPENAI_API_KEY

docker compose up --build
docker compose exec api alembic upgrade head
```

- Frontend: http://localhost:3000
- API + interactive docs: http://localhost:8000/docs

Five containers: `api` (port 8000), `worker` (no exposed port), `db` (port 5433 → container's 5432), `redis` (6379), `frontend` (3000). `api` and `worker` bind-mount `./app` and `./alembic`, so editing backend code hot-reloads without a rebuild (uvicorn's `--reload` flag). **`tests/` and `requirements.txt` are NOT bind-mounted** — changes there require `docker compose build api` before they'll show up in the running container. This bit us during a recent commit-splitting exercise: editing `tests/conftest.py` on the host had zero effect on the running container until an explicit rebuild.

**Faster frontend iteration** (skip the Docker rebuild loop for frontend-only changes):
```bash
docker compose stop frontend
cd frontend && npm install && npm run dev
```

---

## 10. Testing

51 tests, zero real OpenAI calls (everything's mocked at the `app.api.meetings.*` / `app.services.llm.*` boundary).

| File | Covers |
|---|---|
| `test_auth.py` | Register/login happy path, duplicate email, wrong password, protected-route 401 |
| `test_meetings.py` | Upload, Celery dispatch, user isolation, 404 on wrong owner |
| `test_ask.py` | Meeting-scoped Q&A: happy path, 400 on unprocessed meeting, 404s, 401 |
| `test_calendar.py` | Date-range filtering, `meeting_date` vs `created_at` fallback, per-type event shape, user isolation, sorting |
| `test_streaming.py` | SSE frame ordering (`sources` before `token`), fallback messages, mid-stream error handling |
| `test_llm.py` | Retry logic across timeout/rate-limit/4xx/5xx, extraction and embedding mocked end-to-end |

```bash
docker compose up -d db redis
docker compose exec api pytest -v

# or from the host, with the DB port forwarded:
pip install -r requirements.txt
pytest -v
```

Test fixtures create/drop an isolated `contextbridge_test` database per session and roll back each test's transaction — so tests don't touch your dev data and don't leak state between runs. **Rate limiting is force-disabled in tests** (`RATE_LIMIT_ENABLED=false`, set in `conftest.py` before the app is imported) — the `registered_user`/`auth_headers` fixtures re-register and re-login on nearly every test, which would trip even a generous real-world rate limit within one pytest session.

---

## 11. Infrastructure & deployment

**Current production target:** a single AWS EC2 instance (Ubuntu), running the plain `docker-compose.yml` stack directly (not `docker-compose.prod.yml` — see the note below), with ports 3000 and 8000 exposed straight to the internet.

- `infra/setup_ec2.sh` — one-time bootstrap: installs Docker + Compose plugin + git on a fresh instance.
- `infra/deploy.sh` — manual deploy script: `git pull`, `docker compose -f docker-compose.prod.yml up -d --build`, wait for DB healthcheck, run migrations, curl the health endpoint.
- **`docker-compose.prod.yml`** adds an `nginx` service (TLS via certbot, reverse-proxying `/` to the frontend and `/api/` to the API), `restart: unless-stopped` on every service, a DB healthcheck, and correctly wires `NEXT_PUBLIC_API_URL` as a frontend build arg from `.env`. `infra/nginx.conf` has the actual proxy config, currently templated with `YOUR_DOMAIN_HERE` placeholders and a commented-out HTTP-only fallback block for use before a TLS cert exists.
- **⚠️ The automated `deploy.yml` GitHub Actions workflow does NOT use `docker-compose.prod.yml`** — it runs the bare `docker compose up -d --build ...`, i.e. the dev compose file, with ports exposed directly and no nginx/TLS in front. This is a real inconsistency between the two deploy paths (manual script vs. automated CI) worth resolving at some point — see [§14](#14-known-quirks--things-that-will-trip-you-up).

**Environment variables** (full list, from `.env.example` / `.env.prod.example`):

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | — | `postgresql://user:pass@host:port/db` |
| `REDIS_URL` | yes | — | `redis://host:port/0` |
| `SECRET_KEY` | yes | — | JWT signing secret |
| `OPENAI_API_KEY` | yes | — | |
| `OPENAI_EXTRACTION_MODEL` | no | `gpt-4o-mini` | |
| `OPENAI_EMBEDDING_MODEL` | no | `text-embedding-3-small` | |
| `RATE_LIMIT_ENABLED` | no | `true` | forced `false` in tests |
| `CORS_ORIGINS` | no | `http://localhost:3000` | comma-separated; add your deployed frontend's origin here |
| `NEXT_PUBLIC_API_URL` | no | `http://localhost:8000` | **Docker build arg**, not a runtime env var — see [§14](#14-known-quirks--things-that-will-trip-you-up) |

---

## 12. CI/CD

Two separate GitHub Actions workflows, both triggered on push-to-main and PRs-to-main — they run independently and you'll see two separate check runs for one push:

- **`ci.yml`** — lightweight: builds the `api` Docker image, runs `python -c "import app.main"` inside it as a smoke test. No pytest, no deploy.
- **`deploy.yml`** — the real pipeline: spins up Postgres+pgvector and Redis as service containers, runs the full `pytest tests/ -v` suite, and — **only on push to `main`, not on PRs** — SSHes into the EC2 host (`appleboy/ssh-action`, using `EC2_HOST`/`EC2_SSH_KEY` repo secrets) and runs:
  ```bash
  git pull origin main
  docker compose up -d --build --force-recreate --remove-orphans
  sleep 10
  docker compose exec -T api alembic upgrade head
  ```

Because the deploy step is a plain `git pull`, **the EC2 checkout must never have local modifications** — if someone hand-edits a tracked file directly on the server (which has happened — see [§14](#14-known-quirks--things-that-will-trip-you-up)), the next deploy's `git pull` will refuse to overwrite it and the whole pipeline fails at that step.

---

## 13. Key design decisions (the "why")

**pgvector instead of a dedicated vector DB.** One less service to run. At the scale of thousands of meetings per user (not millions), pgvector's cosine-distance index is fast enough, and keeping vectors in the same Postgres instance as structured data means one transaction boundary, no cross-service sync issues.

**Celery instead of FastAPI `BackgroundTasks`.** Covered in [§2](#2-high-level-architecture).

**`strict: true` on the extraction JSON schema.** Without it, GPT occasionally adds commentary, renames fields, or returns malformed JSON. Strict mode makes the API itself enforce the schema — a mismatch raises instead of silently producing garbage, which is what makes the retry logic meaningful.

**Overlapping chunks for embeddings.** A decision spanning a chunk boundary would otherwise be invisible to similarity search. ~20% overlap (50 of 300 tokens) means context is never split at an awkward point.

**Redis-backed rate limiting via `slowapi`, not in-memory.** An in-process counter resets on every restart and doesn't work once there's more than one API replica. Redis-backed limits survive restarts and are shared correctly across replicas. `swallow_errors=True` is a deliberate choice: a Redis blip should degrade to "unlimited" rather than take the whole API down.

**SSE instead of WebSockets for streaming Q&A.** Data only flows one direction (server → client) and the request is already a plain HTTP POST. `StreamingResponse` gets token-by-token delivery without a second protocol or a connection upgrade — WebSockets would solve a problem that doesn't exist here.

**Calendar events filtered in SQL, not Python.** The endpoint used to load every completed meeting (with decisions/gaps eagerly joined) and discard most of them in a Python loop comparing dates. It now filters with `COALESCE(meeting_date, DATE(created_at))` directly in the `WHERE` clause, so out-of-range meetings — and their child rows — are never fetched in the first place.

---

## 14. Known quirks / things that will trip you up

- **`frontend/components/navbar.tsx` and `frontend/components/ui/card.tsx` are dead code.** Neither is imported anywhere — `Sidebar` replaced `Navbar` at some point in the app's history and the old file was never deleted. Don't be surprised that `Navbar` uses a completely different (amber) color scheme than the rest of the app; it's not a design system you're supposed to match, it's a leftover.
- **`tests/` and `requirements.txt` are not bind-mounted into the running containers.** Editing them on the host has zero effect until you `docker compose build api` (and `worker`, if relevant) and recreate the containers. `app/` and `alembic/` *are* mounted, so those changes hot-reload for free.
- **`NEXT_PUBLIC_API_URL` must be a Docker build arg, not a container `environment:` entry.** Next.js inlines `NEXT_PUBLIC_*` variables into the JS bundle at `next build` time — by the time a container is actually running, it's too late for a runtime env var to change anything already baked into the served JS. `docker-compose.yml`'s frontend service passes it via `build.args`, sourced from `.env` with a `localhost:8000` fallback for local dev.
- **CORS origins and the frontend build URL used to be hardcoded directly in `app/main.py` and `docker-compose.yml` on the production server**, applied as a manual SSH edit rather than committed to the repo. This is exactly the kind of thing that causes the automated deploy's `git pull` to fail with "local changes would be overwritten." Both are now environment-driven (`CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`) specifically so this can't happen the same way again — if you ever find yourself hand-editing a tracked file on the server to make something work, that's a signal the value needs to become a `.env` var instead, not a one-off patch.
- **The automated deploy workflow uses `docker-compose.yml`, not `docker-compose.prod.yml`**, even though the latter has nginx/TLS and is clearly the "intended" production setup. In practice the EC2 box is running with ports 3000/8000 exposed directly, no reverse proxy. If you pick up the nginx path, you'll need to update `deploy.yml` to pass `-f docker-compose.prod.yml` (and everywhere else that assumes bare `docker compose`, including `docker compose exec -T api alembic upgrade head`).
- **Windows/Linux line-ending noise.** There's no `.gitattributes` in this repo. If you're developing on Windows and the remote server is Linux, `git diff` can occasionally show a file as "entirely changed" when only one real line differs — that's CRLF vs LF, not a real conflict. Diff with `-b` (ignore whitespace) to see the actual change.
- **Two GitHub Actions workflows fire on every push to `main`.** `ci.yml`'s smoke test is strictly weaker than what `deploy.yml` already does (full pytest suite) — seeing two separate check runs for one push is expected, not a sign something's misconfigured.

---

## 15. Common tasks — where to start

**Add a new extracted field (e.g., a "priority" on action items):**
1. Add the column to `app/models/action_item.py`, generate a migration (`alembic revision --autogenerate -m "add priority to action items"`), review the generated file, `alembic upgrade head`.
2. Add it to `EXTRACTION_SCHEMA` in `app/services/llm.py` (required field, so add it to `required: [...]` too — `strict: true` schemas require every property to be listed as required, using `["string", "null"]` union types for "optional").
3. Update `app/tasks/process_meeting.py`'s `ActionItem(...)` construction to pass the new field through.
4. Add it to `ActionItemOut` in `app/schemas/meeting.py`.
5. Update the frontend's `ActionItem` interface in `lib/api.ts` and wherever it's rendered (`meetings/[id]/page.tsx`, `calendar/page.tsx`).
6. Add test coverage — probably extending `test_meetings.py` or `test_calendar.py`'s fixtures.

**Add a new API route:** put it in `app/api/meetings.py` (or `auth.py` for account-related things) next to the routes it's most related to. Add `request: Request` as the first param and a `@limiter.limit(...)` decorator if it's expensive or abuse-prone — check the existing limits in [§6](#6-api-reference) for what tier makes sense. Add a Pydantic response model. Write a test.

**Add a new frontend page:** create `app/<route>/page.tsx`, add a `useEffect` redirect-if-not-logged-in guard (copy the pattern from any existing page), add a nav entry to `components/sidebar.tsx`'s `NAV_ITEMS` array if it needs a permanent nav link (this automatically updates both the desktop sidebar and the mobile bottom tab bar, since both render from the same array).

**Add a step to the onboarding tour:** add an entry to `frontend/lib/walkthrough-steps.ts` (path, selector, title, body, placement), and add the matching `data-tour="..."` attribute to the target element. If the target lives in the sidebar, remember both the desktop and mobile nav render from the same `NAV_ITEMS` array in `sidebar.tsx`, so one `data-tour` value naturally covers both.

**Debug a failed meeting:** check `docker compose logs worker` for the exception (the task re-raises after setting status to `failed`, so the traceback is there). The "Try Again" button on the meeting detail page calls `POST /meetings/{id}/reprocess`, which deletes any partial `Decision`/`ActionItem`/`Gap`/`MeetingChunk` rows and re-queues the task from scratch.
