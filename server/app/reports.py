"""Reports of AI-made cards, sent from the app's Review cards screen.

Google Play requires that people can flag offensive AI content from inside the app, and that the
developer uses the reports. They are read on the admin page (app/admin.py). A report keeps the
card's two sides and the reason, never the text the cards were made from. Resolved reports are
deleted RESOLVED_KEEP_DAYS later, when the admin page is opened (no scheduled jobs, so Neon can
sleep).
"""

from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from uuid import uuid4

from sqlalchemy import Engine, delete, func, insert, select, update

from app.models import AiReport
from app.quota import ensure_device

RESOLVED_KEEP_DAYS = 90
# Room for cards the user edited before reporting (the AI's own limits are 500 / 2,000).
MAX_FRONT_CHARS = 2_000
MAX_BACK_CHARS = 4_000
Reason = Literal["offensive", "wrong", "other"]

reports = AiReport.__table__


def add(engine: Engine, device_id: str, front: str, back: str, reason: str) -> str:
    """Stores a report and returns its id. Adds the device if this phone never made cards before
    (a report normally follows /generate, but its row may be gone)."""
    report_id = str(uuid4())
    with engine.begin() as conn:
        ensure_device(conn, device_id)
        conn.execute(
            insert(AiReport).values(
                id=report_id, device_id=device_id, front=front, back=back, reason=reason
            )
        )
    return report_id


def count_today(engine: Engine, device_id: str, day: date) -> int:
    start = datetime.combine(day, time.min, tzinfo=UTC)
    with engine.connect() as conn:
        return conn.execute(
            select(func.count())
            .select_from(reports)
            .where(reports.c.device_id == device_id, reports.c.created_at >= start)
        ).scalar_one()


def list_reports(engine: Engine, include_resolved: bool = False, limit: int = 200):
    """(open count, newest reports first). Also forgets long-resolved reports."""
    cutoff = datetime.now(UTC) - timedelta(days=RESOLVED_KEEP_DAYS)
    with engine.begin() as conn:
        conn.execute(delete(reports).where(reports.c.resolved_at < cutoff))
        query = select(reports).order_by(reports.c.created_at.desc()).limit(limit)
        if not include_resolved:
            query = query.where(reports.c.resolved_at.is_(None))
        rows = [dict(row) for row in conn.execute(query).mappings()]
        open_count = conn.execute(
            select(func.count()).select_from(reports).where(reports.c.resolved_at.is_(None))
        ).scalar_one()
    return open_count, rows


def resolve(engine: Engine, report_id: str) -> bool:
    """Marks a report as dealt with. False if there's no such report."""
    with engine.begin() as conn:
        found = conn.execute(select(reports.c.id).where(reports.c.id == report_id)).first()
        if found is None:
            return False
        conn.execute(
            update(reports)
            .where(reports.c.id == report_id, reports.c.resolved_at.is_(None))
            .values(resolved_at=datetime.now(UTC))
        )
    return True
