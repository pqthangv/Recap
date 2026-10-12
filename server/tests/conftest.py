import os

# Before the app reads its settings: no real database or AI in tests, and ignore server/.env.
os.environ.update({"DATABASE_URL": "", "LLM_PROVIDER": "fake", "GEMINI_API_KEY": ""})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

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


@pytest.fixture
def engine():
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
