"""Server tables. Devices are anonymous: a random UUID made once on the phone, nothing personal.

Phase 6 links devices to an optional account (and moves the AI quota to the account), so a
device id stays stable forever.
"""

from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class AiUsage(Base):
    """Cards generated per device per UTC day."""

    __tablename__ = "ai_usage"

    device_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    cards_generated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
