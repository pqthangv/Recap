"""Settings from environment variables (and server/.env when running locally)."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Neon's pooled connection string in production; sqlite:///./dev.db for local development.
    # Empty means "not set up": /health still works, everything that needs the database fails.
    database_url: str = ""
    gemini_api_key: str = ""
    # Free-tier models, best first. Each has its own free allowance: when one is rate limited or
    # down, requests move on to the next and skip it for a while (see app/llm/gemini.py).
    # Fast first; the rest are slower (~10 s) but keep AI working when the first runs out.
    gemini_model: str = (
        "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash,"
        "gemini-3.6-flash,gemini-3.1-flash-lite-preview,gemma-4-26b-a4b-it,gemma-4-31b-it"
    )
    # "fake" makes cards without calling Gemini (local development and tests).
    llm_provider: Literal["gemini", "fake"] = "gemini"

    daily_card_quota: int = 50
    # Per network address (see app/abuse.py): stops one machine inventing device ids.
    ip_daily_card_quota: int = 200
    ip_requests_per_minute: int = 30
    # API docs (/docs, /redoc, /openapi.json). Off in production; set ENABLE_DOCS=true locally.
    enable_docs: bool = False
    max_input_chars: int = 15_000
    max_cards_per_request: int = 30
    max_topic_chars: int = 200
    max_pdf_bytes: int = 10 * 1024 * 1024
    # JSON bodies: 15,000 characters of Vietnamese can be ~60 KB of UTF-8, plus escaping.
    max_json_bytes: int = 256 * 1024

    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
