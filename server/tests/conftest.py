import os

# Before the app reads its settings: no real database or AI in tests, and ignore server/.env.
os.environ.update({"DATABASE_URL": "", "LLM_PROVIDER": "fake", "GEMINI_API_KEY": ""})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.abuse import limits  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import make_engine, set_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402

get_settings.cache_clear()


@pytest.fixture(autouse=True)
def fresh_limits():
    """The per-address limits live in memory; every test starts with none used."""
    limits.reset()


# Set TEST_DATABASE_URL (CI does, with a PostgreSQL service) to run every test against real
# Postgres, the way Render + Neon run. Otherwise tests use an in-memory SQLite database.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")


@pytest.fixture(scope="session")
def postgres_engine():
    if not TEST_DATABASE_URL:
        yield None
        return
    from alembic import command
    from alembic.config import Config

    engine = make_engine(TEST_DATABASE_URL)
    config = Config("alembic.ini")
    with engine.begin() as connection:  # the real migrations, not create_all
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    yield engine
    engine.dispose()


@pytest.fixture
def engine(postgres_engine):
    if postgres_engine is not None:
        with postgres_engine.begin() as connection:
            connection.execute(text("DELETE FROM ai_usage"))
            connection.execute(text("DELETE FROM devices"))
        set_engine(postgres_engine)
        yield postgres_engine
        set_engine(None)
        return
    engine = make_engine("sqlite://")
    Base.metadata.create_all(engine)
    set_engine(engine)
    yield engine
    set_engine(None)
    engine.dispose()


@pytest.fixture
def client(engine):
    with TestClient(app) as client:
        yield client


DEVICE = "6f1c2b9e-3d4a-4e5f-8a7b-1c2d3e4f5a6b"
