"""
Test fixtures. Uses a separate `contextbridge_test` database on the same
Postgres instance the Docker stack already runs, so we never touch prod data
and never need a second server. The vector extension is enabled once on setup.
Celery tasks are always mocked — tests must not trigger real OpenAI calls.
"""
import os
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from unittest.mock import patch

# Override env before any app module is imported
# Inside Docker the DB host is "db"; from the host machine it's 127.0.0.1:5433
TEST_DB_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://contextbridge:contextbridge@db:5432/contextbridge_test",
)
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("OPENAI_API_KEY", "sk-test-dummy")

from app.core.database import Base, get_db  # noqa: E402 — must come after env override
from app.main import app  # noqa: E402


# ── One-time DB setup ─────────────────────────────────────────────────────────

def _admin_engine():
    """Connect to the default 'contextbridge' DB so we can create/drop the test DB."""
    url = TEST_DB_URL.rsplit("/", 1)[0] + "/contextbridge"
    return create_engine(url, isolation_level="AUTOCOMMIT")


@pytest.fixture(scope="session", autouse=True)
def create_test_database():
    admin = _admin_engine()
    with admin.connect() as conn:
        conn.execute(text("DROP DATABASE IF EXISTS contextbridge_test"))
        conn.execute(text("CREATE DATABASE contextbridge_test"))
    admin.dispose()

    engine = create_engine(TEST_DB_URL)
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    Base.metadata.create_all(engine)
    engine.dispose()
    yield
    # teardown: drop test DB after the whole session
    admin = _admin_engine()
    with admin.connect() as conn:
        conn.execute(text(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='contextbridge_test'"
        ))
        conn.execute(text("DROP DATABASE IF EXISTS contextbridge_test"))
    admin.dispose()


# ── Per-test DB session (rolls back after each test) ─────────────────────────

@pytest.fixture()
def db_session():
    engine = create_engine(TEST_DB_URL)
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()
    engine.dispose()


# ── FastAPI test client ───────────────────────────────────────────────────────

@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    # Always mock celery — tests must never call OpenAI
    with patch("app.api.meetings.process_meeting_task.delay"):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


# ── Auth helpers ──────────────────────────────────────────────────────────────

@pytest.fixture()
def registered_user(client):
    client.post("/auth/register", json={"email": "user@test.com", "password": "pw123456"})
    return {"email": "user@test.com", "password": "pw123456"}


@pytest.fixture()
def auth_headers(client, registered_user):
    res = client.post("/auth/login", data={
        "username": registered_user["email"],
        "password": registered_user["password"],
    })
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
