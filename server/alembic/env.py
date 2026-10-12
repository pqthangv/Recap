from logging.config import fileConfig

from alembic import context

from app.db import get_engine
from app.models import Base

if context.config.config_file_name is not None:
    # Keep the app's loggers on: the tests run migrations in the same process (on PostgreSQL in
    # CI), and fileConfig's default would silence every logger that already exists.
    fileConfig(context.config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_online() -> None:
    # Tests pass their own connection; otherwise use DATABASE_URL like the app does.
    connection = context.config.attributes.get("connection")
    if connection is not None:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
        return
    with get_engine().connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
