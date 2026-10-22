"""Google Play Integrity (roadmap 6.0): proof that an AI request comes from the real Recap app,
installed from Google Play, on a real Android phone. Then the day's AI cards are counted by the
phone itself, which reinstalling, airplane mode or a new network doesn't change.

The app sends `phone_id`, a SHA-256 (hex) of its Android ID (the same for Recap on that phone
until a factory reset; the ID itself never leaves the phone), and a ticket from Google Play made
for that value (the ticket's requestHash). Google reads the ticket for us, and each one works
once. Android only for now: iPhones (App Attest) come later.

Nothing here ever blocks a request: no ticket, a ticket that fails, or Google being down all mean
the install id's allowance, as before. Tickets and ids are never logged.
"""

import json
import logging
import time
from functools import lru_cache
from uuid import UUID, uuid5

from app.config import Settings

log = logging.getLogger(__name__)

# Fixed forever: a new value would give every phone a fresh counter.
PHONE_NAMESPACE = UUID("c7423f4f-7951-4475-8a02-1c1923642bcf")
SCOPE = "https://www.googleapis.com/auth/playintegrity"
# MEETS_DEVICE_INTEGRITY is Google's default label; STRONG only shows up if turned on in Play
# Console. BASIC is never required: it may not be sent at all.
DEVICE_VERDICTS = {"MEETS_DEVICE_INTEGRITY", "MEETS_STRONG_INTEGRITY"}
# Google already stops a ticket being used twice; this only turns away very old ones.
MAX_AGE_MS = 15 * 60 * 1000
CLOCK_SKEW_MS = 60 * 1000
TIMEOUT_S = 10


class GoogleBusy(Exception):
    """Google's daily allowance for reading tickets is used up (or it said slow down)."""


def enabled(settings: Settings) -> bool:
    return bool(settings.play_integrity_credentials.strip())


def trusted_id(phone_id: str) -> str:
    """The phone's quota id. A version-5 UUID, so it fits the devices table and can never be the
    same as an install id (version 4)."""
    return str(uuid5(PHONE_NAMESPACE, phone_id))


@lru_cache(maxsize=1)
def _session(credentials_json: str):
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account

    credentials = service_account.Credentials.from_service_account_info(
        json.loads(credentials_json), scopes=[SCOPE]
    )
    return AuthorizedSession(credentials, refresh_timeout=TIMEOUT_S)


def decode(token: str, settings: Settings) -> dict | None:
    """Asks Google what the ticket says. None when Google says it isn't a ticket at all."""
    session = _session(settings.play_integrity_credentials.strip())
    response = session.post(
        f"https://playintegrity.googleapis.com/v1/{settings.android_package}:decodeIntegrityToken",
        json={"integrity_token": token},
        timeout=TIMEOUT_S,
    )
    if response.status_code == 429:
        raise GoogleBusy
    if response.status_code == 400:
        return None
    response.raise_for_status()
    return response.json().get("tokenPayloadExternal") or {}


def verdict(payload: dict, phone_id: str, package: str, now_ms: int) -> str:
    """ "passed", "passed-test" (a test answer set in Play Console) or "failed:<why>"."""
    request = payload.get("requestDetails") or {}
    if request.get("requestPackageName") != package:
        return "failed:package"
    if request.get("requestHash") != phone_id:
        return "failed:phone"
    try:
        age = now_ms - int(request.get("timestampMillis"))
    except (TypeError, ValueError):
        return "failed:time"
    if not -CLOCK_SKEW_MS <= age <= MAX_AGE_MS:
        return "failed:time"
    # A ticket used a second time comes back UNEVALUATED here.
    if (payload.get("appIntegrity") or {}).get("appRecognitionVerdict") != "PLAY_RECOGNIZED":
        return "failed:app"
    labels = (payload.get("deviceIntegrity") or {}).get("deviceRecognitionVerdict") or []
    if not DEVICE_VERDICTS & set(labels):
        return "failed:device"
    testing = (payload.get("testingDetails") or {}).get("isTestingResponse") is True
    return "passed-test" if testing else "passed"


def check(
    phone_id: str | None, token: str | None, settings: Settings, now_ms: int | None = None
) -> str | None:
    """The phone's trusted id when its ticket passes; None means "count by the install id"."""
    if not enabled(settings):
        return None
    if not phone_id or not token:
        log.info("integrity", extra={"result": "missing"})
        return None
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    try:
        payload = decode(token, settings)
        result = (
            "failed:ticket"
            if payload is None
            else verdict(payload, phone_id, settings.android_package, now)
        )
    except GoogleBusy:
        # Every phone now gets the no-ticket allowance: worth noticing in Render's logs.
        log.warning("integrity", extra={"result": "google-busy"})
        return None
    except Exception as e:  # Google down, a bad key, an odd answer: never the user's problem
        log.error("integrity", extra={"result": "error", "reason": type(e).__name__})
        return None
    log.info("integrity", extra={"result": result})
    return trusted_id(phone_id) if result.startswith("passed") else None
