"""Per-device daily card quota (Gemini's free limits are shared by every Recap user).

A request first reserves the cards it may make, then gives back what it didn't use. Reserving is
a conditional UPDATE, so two requests at once can never go over the limit. Each step is its own
short transaction: no connection is held while waiting for the AI.
"""

from datetime import UTC, date, datetime

from sqlalchemy import Connection, Engine, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.models import AiUsage, Device


def today_utc(now: datetime | None = None) -> date:
    return (now or datetime.now(UTC)).astimezone(UTC).date()


def _insert(engine: Engine):
    return pg_insert if engine.dialect.name == "postgresql" else sqlite_insert


def ensure_device(conn: Connection, device_id: str) -> None:
    """Adds the device's row the first time a phone shows up."""
    conn.execute(_insert(conn.engine)(Device).values(id=device_id).on_conflict_do_nothing())


def used_today(engine: Engine, device_id: str, day: date) -> int:
    with engine.connect() as conn:
        used = conn.execute(
            select(AiUsage.cards_generated).where(
                AiUsage.device_id == device_id, AiUsage.day == day
            )
        ).scalar_one_or_none()
    return used or 0


def remaining(engine: Engine, device_id: str, day: date, quota: int) -> int:
    return max(0, quota - used_today(engine, device_id, day))


def reserve(engine: Engine, device_id: str, day: date, wanted: int, quota: int) -> int:
    """Reserves up to `wanted` cards for today. Returns how many were reserved (0 = quota used)."""
    with engine.begin() as conn:
        ensure_device(conn, device_id)
        conn.execute(
            _insert(engine)(AiUsage)
            .values(device_id=device_id, day=day, cards_generated=0)
            .on_conflict_do_nothing()
        )
        # Optimistic: only add if nobody changed the count since we read it.
        for _ in range(5):
            used = conn.execute(
                select(AiUsage.cards_generated).where(
                    AiUsage.device_id == device_id, AiUsage.day == day
                )
            ).scalar_one()
            take = min(wanted, quota - used)
            if take <= 0:
                return 0
            result = conn.execute(
                update(AiUsage)
                .where(
                    AiUsage.device_id == device_id,
                    AiUsage.day == day,
                    AiUsage.cards_generated == used,
                )
                .values(cards_generated=used + take)
            )
            if result.rowcount == 1:
                return take
    return 0


def refund(engine: Engine, device_id: str, day: date, cards: int) -> None:
    """Gives back reserved cards that weren't made (AI failed, or it made fewer)."""
    if cards <= 0:
        return
    with engine.begin() as conn:
        conn.execute(
            update(AiUsage)
            .where(
                AiUsage.device_id == device_id,
                AiUsage.day == day,
                AiUsage.cards_generated >= cards,
            )
            .values(cards_generated=AiUsage.cards_generated - cards)
        )
