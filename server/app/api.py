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

from app import quota
from app.abuse import client_ip, limits, rate_limit
from app.config import Settings, get_settings
from app.db import DatabaseNotConfigured, get_engine
from app.errors import ApiError
from app.llm.base import Card, CardProvider, GenerationRequest, Mode, ProviderBusy, ProviderFailed
from app.llm.cleaning import clean_cards
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


@router.get("/quota")
def get_quota(
    device_id: Annotated[UUID, Query()], settings: SettingsDep, engine: EngineDep
) -> QuotaResponse:
    left = quota.remaining(engine, str(device_id), quota.today_utc(), settings.daily_card_quota)
    return QuotaResponse(remaining=left, limit=settings.daily_card_quota)


class GenerateRequest(BaseModel):
    device_id: UUID
    text: str
    mode: Mode = "text"
    max_cards: int = Field(default=10, ge=1)
    language: str | None = Field(default=None, max_length=40)


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
        quota.refund(engine, device_id, day, cards)
        limits.refund_cards(ip, day, cards)

    started = time.monotonic()
    request = GenerationRequest(
        text=text, mode=body.mode, max_cards=reserved, language=body.language
    )
    try:
        raw = provider.generate(request)
    except ProviderBusy as e:
        give_back(reserved)
        log.warning("ai busy", extra={"reason": str(e)})
        raise ApiError(503, "ai_busy", "AI is busy, try again later.") from e
    except ProviderFailed as e:
        give_back(reserved)
        log.error("ai failed", extra={"reason": str(e)})
        raise ApiError(
            502, "ai_failed", "The AI couldn't make cards this time. Please try again."
        ) from e
    except Exception:
        give_back(reserved)
        raise

    cards = clean_cards(raw, reserved)
    give_back(reserved - len(cards))
    left = quota.remaining(engine, device_id, day, daily)
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
