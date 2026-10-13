"""Server tables. Devices are anonymous: a random UUID made once on the phone, nothing personal.

Phase 6 links devices to an optional account (and moves the AI quota to the account), so a
device id stays stable forever.
"""

from datetime import UTC, date, datetime
from uuid import uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _now() -> datetime:
    return datetime.now(UTC)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AiUsage(Base):
    """Cards generated per device per UTC day."""

    __tablename__ = "ai_usage"

    device_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    cards_generated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AiReport(Base):
    """An AI-made card someone reported from the app (Google Play requires in-app reporting of AI
    content). Only the card is kept, never the text it was made from."""

    __tablename__ = "ai_reports"
    __table_args__ = (Index("ix_ai_reports_device_created", "device_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    device_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False
    )
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
