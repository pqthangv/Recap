from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.db import make_engine
from app.models import Base


def test_migrations_create_the_same_tables_as_the_models():
    engine = make_engine("sqlite://")
    config = Config("alembic.ini")
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")

    inspector = inspect(engine)
    for table in Base.metadata.sorted_tables:
        migrated = {c["name"] for c in inspector.get_columns(table.name)}
        assert migrated == {c.name for c in table.columns}, table.name
