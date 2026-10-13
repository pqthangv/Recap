"""Limits per network address, so one machine can't spam the API or drain the shared free AI
quota by inventing device ids (the per-device quota alone can't stop that: the phone makes its own
id). Kept in memory on the one free Render instance: a restart forgets them, which is fine.

IP addresses are only held here, briefly, and never logged or stored.
"""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from datetime import date

from fastapi import Request

from app.config import get_settings
from app.errors import ApiError


def client_ip(request: Request) -> str:
    """The caller's address. On Render, Cloudflare sets CF-Connecting-IP on every request and
    overwrites any value the caller sent; X-Forwarded-For's first entry can be faked, so it's not
    used. Locally (no Cloudflare) it's the direct connection."""
    return request.headers.get("cf-connecting-ip") or (
        request.client.host if request.client else "unknown"
    )


class IpLimits:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._recent: dict[str, deque[float]] = defaultdict(deque)
        self._cards_day: date | None = None
        self._cards: dict[str, int] = defaultdict(int)
        self._reports: dict[str, int] = defaultdict(int)

    def reset(self) -> None:
        with self._lock:
            self._recent.clear()
            self._cards.clear()
            self._reports.clear()
            self._cards_day = None

    def check_rate(self, ip: str, per_minute: int) -> None:
        """At most `per_minute` requests in any 60 seconds."""
        now = self._clock()
        with self._lock:
            recent = self._recent[ip]
            while recent and now - recent[0] >= 60:
                recent.popleft()
            if len(recent) >= per_minute:
                raise ApiError(
                    429, "rate_limited", "Too many requests. Please wait a minute and try again."
                )
            recent.append(now)
            if len(self._recent) > 10_000:  # forget idle addresses
                for key in [k for k, v in self._recent.items() if not v or now - v[-1] >= 60]:
                    del self._recent[key]

    def _today(self, day: date) -> None:
        if self._cards_day != day:
            self._cards_day = day
            self._cards.clear()
            self._reports.clear()

    def reserve_cards(self, ip: str, day: date, wanted: int, daily: int) -> int:
        """Like the device quota: takes up to `wanted` of today's cards for this address."""
        with self._lock:
            self._today(day)
            take = max(0, min(wanted, daily - self._cards[ip]))
            self._cards[ip] += take
            return take

    def refund_cards(self, ip: str, day: date, cards: int) -> None:
        with self._lock:
            if self._cards_day == day and cards > 0:
                self._cards[ip] = max(0, self._cards[ip] - cards)

    def take_report(self, ip: str, day: date, daily: int) -> bool:
        """Counts one report from this address today. False once it has sent `daily`."""
        with self._lock:
            self._today(day)
            if self._reports[ip] >= daily:
                return False
            self._reports[ip] += 1
            return True


limits = IpLimits()


def rate_limit(request: Request) -> None:
    """Every /v1 request counts toward the per-minute limit (not /health: uptime pings)."""
    limits.check_rate(client_ip(request), get_settings().ip_requests_per_minute)
