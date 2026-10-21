"""The /v1 endpoints the app calls."""

import logging
import time
from functools import lru_cache
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import Engine

from app import quota, reports
from app.abuse import client_ip, limits, rate_limit
from app.config import Settings, get_settings
from app.db import DatabaseNotConfigured, get_engine
from app.errors import ApiError
from app.llm.base import (
    Card,
    CardProvider,
    GenerationRequest,
    Mode,
    ProviderBlocked,
    ProviderBusy,
    ProviderFailed,
)
from app.llm.cleaning import clean_cards
from app.llm.languages import LanguageCode
from app.pdf import extract_text

log = logging.getLogger(__name__)
# Every /v1 request counts toward the per-address rate limit (app/abuse.py).
router = APIRouter(prefix="/v1", dependencies=[Depends(rate_limit)])

SettingsDep = Annotated[Settings, Depends(get_settings)]


def engine_dep() -> Engine:
    try:
        return get_engine()
    except DatabaseNotConfigured as e:
        log.error("database not configured")
        raise ApiError(503, "not_configured", "Recap's server isn't set up yet.") from e


EngineDep = Annotated[Engine, Depends(engine_dep)]


@lru_cache
def _make_provider(name: str, api_key: str, model: str) -> CardProvider:
    if name == "fake":
        from app.llm.fake import FakeProvider

        return FakeProvider()
    if not api_key:
        raise ApiError(503, "not_configured", "Recap's AI isn't set up yet.")
    from app.llm.gemini import GeminiProvider, parse_models

    return GeminiProvider(api_key=api_key, models=parse_models(model))


def provider_dep(settings: SettingsDep) -> CardProvider:
    return _make_provider(settings.llm_provider, settings.gemini_api_key, settings.gemini_model)


ProviderDep = Annotated[CardProvider, Depends(provider_dep)]


def verify_app(request: Request) -> None:
    """Hook for Play Integrity / App Attest (roadmap 3.5): later this checks a token sent by the
    phone, so only the real app can spend the shared AI quota. For now every request passes."""
    del request


AppCheck = [Depends(verify_app)]


class QuotaResponse(BaseModel):
    remaining: int
    limit: int


def cards_left(engine: Engine, device_id: str, ip: str, settings: Settings) -> int:
    """Today's AI cards this phone can still make: its own allowance, or its network's when
    that's lower (e.g. other phones on the same Wi-Fi used it up), so the app never shows
    cards it can't make."""
    day = quota.today_utc()
    return min(
        quota.remaining(engine, device_id, day, settings.daily_card_quota),
        limits.cards_left(ip, day, settings.ip_daily_card_quota),
    )


@router.get("/quota")
def get_quota(
    device_id: Annotated[UUID, Query()],
    http_request: Request,
    settings: SettingsDep,
    engine: EngineDep,
) -> QuotaResponse:
    left = cards_left(engine, str(device_id), client_ip(http_request), settings)
    return QuotaResponse(remaining=left, limit=settings.daily_card_quota)


class GenerateRequest(BaseModel):
    device_id: UUID
    text: str
    mode: Mode = "text"
    max_cards: int = Field(default=10, ge=1)
    # Each side's language as a code from a fixed list (anything else is refused before the AI or
    # the daily quota is touched); None = the source's language.
    front_language: LanguageCode | None = None
    back_language: LanguageCode | None = None
    # Sent by apps that draw math (1.0.6+); older apps leave it out.
    math: bool = False


class GenerateResponse(BaseModel):
    cards: list[Card]
    remaining: int


@router.post("/generate", dependencies=AppCheck)
def generate(
    body: GenerateRequest,
    http_request: Request,
    settings: SettingsDep,
    engine: EngineDep,
    provider: ProviderDep,
) -> GenerateResponse:
    text = body.text.strip()
    if not text:
        raise ApiError(422, "empty", "Add some text first.")
    limit = settings.max_topic_chars if body.mode == "topic" else settings.max_input_chars
    if len(text) > limit:
        raise ApiError(413, "too_long", f"That's too long. Keep it under {limit:,} characters.")

    device_id, day, daily = str(body.device_id), quota.today_utc(), settings.daily_card_quota
    ip = client_ip(http_request)
    wanted = min(body.max_cards, settings.max_cards_per_request)
    # Two daily limits: per network address (stops invented device ids), then per device.
    allowed = limits.reserve_cards(ip, day, wanted, settings.ip_daily_card_quota)
    if allowed == 0:
        raise ApiError(
            429,
            "ip_quota_exceeded",
            "Lots of AI cards were made from your network today. More tomorrow!",
            remaining=0,  # even if this phone still has some: none can be made from here today
        )
    reserved = quota.reserve(engine, device_id, day, allowed, daily)
    limits.refund_cards(ip, day, allowed - reserved)
    if reserved == 0:
        raise ApiError(
            429,
            "quota_exceeded",
            f"You've made {daily} AI cards today. More tomorrow!",
            remaining=0,
        )

    def give_back(cards: int) -> None:
        """Cards that weren't made, back to the phone and its network."""
        quota.refund(engine, device_id, day, cards)
        limits.refund_cards(ip, day, cards)

    def give_back_to_phone(cards: int) -> None:
        """A failed request (text the AI refused, an unusable answer, no usable cards) costs the
        phone nothing but still counts for its network. Otherwise failures could be repeated
        without end, each one a call on the shared free Gemini quota. A busy AI is different:
        it never answered, so give_back() returns everything."""
        quota.refund(engine, device_id, day, cards)

    started = time.monotonic()
    request = GenerationRequest(
        text=text,
        mode=body.mode,
        max_cards=reserved,
        front_language=body.front_language,
        back_language=body.back_language,
        math=body.math,
    )
    try:
        raw = provider.generate(request)
    except ProviderBusy as e:
        give_back(reserved)
        log.warning("ai busy", extra={"reason": str(e)})
        raise ApiError(503, "ai_busy", "AI is busy, try again later.") from e
    except ProviderBlocked as e:
        give_back_to_phone(reserved)
        log.info("ai refused", extra={"reason": str(e)})  # the reason only, never the text
        raise ApiError(
            422,
            "blocked",
            "Recap can't make cards from that. Try different text.",
            remaining=cards_left(engine, device_id, ip, settings),
        ) from e
    except ProviderFailed as e:
        give_back_to_phone(reserved)
        log.error("ai failed", extra={"reason": str(e)})
        raise ApiError(
            502,
            "ai_failed",
            "The AI couldn't make cards this time. Please try again.",
            remaining=cards_left(engine, device_id, ip, settings),
        ) from e
    except Exception:
        give_back(reserved)  # a bug on our side: nobody pays for it
        raise

    cards = clean_cards(raw, reserved, math=body.math)
    if cards:
        give_back(reserved - len(cards))
    else:
        give_back_to_phone(reserved)
    left = cards_left(engine, device_id, ip, settings)
    log.info(
        "generated",
        extra={
            "mode": body.mode,
            "input_chars": len(text),
            "asked": body.max_cards,
            "reserved": reserved,
            "returned": len(raw),
            "kept": len(cards),
            "ms": round((time.monotonic() - started) * 1000),
        },
    )
    if not cards:
        raise ApiError(
            422,
            "no_cards",
            "Couldn't find anything to make cards from. Try adding more text.",
            remaining=left,
        )
    return GenerateResponse(cards=cards, remaining=left)


class ReportRequest(BaseModel):
    device_id: UUID
    front: str = Field(max_length=reports.MAX_FRONT_CHARS)
    back: str = Field(max_length=reports.MAX_BACK_CHARS)
    reason: reports.Reason


class ReportResponse(BaseModel):
    ok: bool = True


@router.post("/report", status_code=201, dependencies=AppCheck)
def report_card(
    body: ReportRequest, http_request: Request, settings: SettingsDep, engine: EngineDep
) -> ReportResponse:
    """Flags an AI-made card from the app's Review cards screen. Read reports on /admin."""
    front, back = body.front.strip(), body.back.strip()
    if not front and not back:
        raise ApiError(422, "empty", "That card is empty.")
    device_id, day = str(body.device_id), quota.today_utc()
    if reports.count_today(engine, device_id, day) >= settings.daily_report_quota or (
        not limits.take_report(client_ip(http_request), day, settings.ip_daily_report_quota)
    ):
        raise ApiError(
            429, "too_many_reports", "You've sent a lot of reports today. Thanks! More tomorrow."
        )
    reports.add(engine, device_id, front, back, body.reason)
    # A warning, so new reports stand out in Render's logs. Never the card's text.
    log.warning("ai card reported", extra={"reason": body.reason})
    return ReportResponse()


class PdfResponse(BaseModel):
    text: str
    pages: int
    truncated: bool


@router.post("/extract-pdf", dependencies=AppCheck)
async def extract_pdf(
    device_id: Annotated[UUID, Form()], file: Annotated[UploadFile, File()], settings: SettingsDep
) -> PdfResponse:
    data = await file.read()  # in memory (see main.py: uploads aren't spooled to disk)
    await file.close()
    if len(data) > settings.max_pdf_bytes:
        raise ApiError(413, "too_large", "That PDF is too big. The limit is 10 MB.")
    result = await run_in_threadpool(extract_text, data, settings.max_input_chars)
    log.info(
        "pdf extracted",
        extra={"bytes": len(data), "pages": result.pages, "chars": len(result.text)},
    )
    return PdfResponse(text=result.text, pages=result.pages, truncated=result.truncated)
