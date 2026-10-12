"""Database engine, created on first use so /health (and app startup) never touch the database.

Production uses Neon's pooled connection string: a small pool, pre-ping (Neon suspends idle
computes, which drops connections) and no server-side prepared statements (Neon's pooler is
PgBouncer in transaction mode). No background or scheduled queries, so Neon can sleep.
"""

from sqlalchemy import Engine, create_engine
from sqlalchemy.pool import StaticPool

from app.config import get_settings

_engine: Engine | None = None


class DatabaseNotConfigured(RuntimeError):
    pass


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        # Endpoints run in a thread pool; an in-memory database must be one shared connection.
        in_memory = url in ("sqlite://", "sqlite:///:memory:")
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool if in_memory else None,
        )
    if url.startswith("postgres://"):  # some dashboards hand out this older scheme
        url = "postgresql://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return create_engine(
        url,
        pool_size=2,
        max_overflow=1,
        pool_pre_ping=True,
        pool_recycle=240,
        connect_args={"prepare_threshold": None},
    )


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = get_settings().database_url
        if not url:
            raise DatabaseNotConfigured("DATABASE_URL is not set")
        _engine = make_engine(url)
    return _engine


def set_engine(engine: Engine | None) -> None:
    """Tests use their own engine."""
    global _engine
    _engine = engine
