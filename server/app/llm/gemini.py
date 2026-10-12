"""Cards from Google's Gemini API (free tier) using structured JSON output.

Free-tier limits are per Google project and shared by every Recap user, but each model has its
own allowance. So the server keeps a list of models (GEMINI_MODEL, best first):

- Each request makes at most 3 tries, with exponential backoff and full jitter between them.
  Each try goes to the next model, so a rate-limited (429), overloaded (5xx, timeout), retired
  (404) or confused model hands over to another. After 3 failed tries: ProviderBusy ("AI is
  busy, try again later").
- A model that was rate limited or down is skipped by later requests for a while (cooldown), so
  when one model's daily quota runs out, requests go straight to the next one instead of
  wasting a try on it each time.

The SDK's own retries are off by default, so they don't multiply with these.
"""

import json
import logging
import random
import re
import time
from collections.abc import Callable, Sequence

import httpx
from google import genai
from google.genai import errors, types

from app.llm.base import CardList, GenerationRequest, ProviderBusy, ProviderFailed
from app.llm.prompt import SYSTEM_INSTRUCTION, build_prompt

log = logging.getLogger(__name__)

MAX_TRIES = 3
BACKOFF_BASE_SECONDS = 1.0
TIMEOUT_MS = 25_000  # per try; the app waits up to 120 s in total
# Gemma runs slower on the free API (the 31B model takes 30-40 s), and is only reached when the
# Gemini models are rate limited, so it gets more time.
SLOW_MODEL_TIMEOUT_MS = 60_000
MAX_OUTPUT_TOKENS = 8_192  # 30 short cards need ~2,000
BUSY_STATUS = {429, 500, 502, 503, 504}
COOLDOWN_SECONDS = 60.0
# A used-up daily quota (or a retired model) is checked again after an hour.
LONG_COOLDOWN_SECONDS = 3_600.0


def parse_models(setting: str) -> list[str]:
    """GEMINI_MODEL: one model, or several separated by commas (best first)."""
    models = [m.strip() for m in setting.split(",") if m.strip()]
    if not models:
        raise ValueError("GEMINI_MODEL is empty")
    return models


def cooldown_after(error: errors.APIError) -> float:
    """How long to skip a model after this error. Google's 429 details name the quota that ran
    out (per day or per minute) and often suggest a retry delay."""
    if error.code == 404:
        return LONG_COOLDOWN_SECONDS
    details = json.dumps(error.details, default=str) if error.details else str(error)
    if "PerDay" in details:
        return LONG_COOLDOWN_SECONDS
    delay = re.search(r'"retryDelay":\s*"(\d+(?:\.\d+)?)s"', details)
    return min(float(delay.group(1)), LONG_COOLDOWN_SECONDS) if delay else COOLDOWN_SECONDS


class GeminiProvider:
    def __init__(
        self,
        api_key: str,
        models: Sequence[str],
        *,
        client: genai.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client or genai.Client(
            api_key=api_key, http_options=types.HttpOptions(timeout=TIMEOUT_MS)
        )
        self._models = list(models)
        self._sleep = sleep
        self._clock = clock
        # Model → when it may be tried again (clock time). In memory: a restart forgets it.
        self._cooling: dict[str, float] = {}
        # Temperature stays at the default: Google advises against lowering it for Gemini 3.
        self._config = types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=CardList,
            max_output_tokens=MAX_OUTPUT_TOKENS,
        )
        self._slow_config = self._config.model_copy(
            update={"http_options": types.HttpOptions(timeout=SLOW_MODEL_TIMEOUT_MS)}
        )

    def _order(self) -> list[str]:
        """Models to try now: available ones in list order, then cooling ones (soonest first)."""
        now = self._clock()
        ready = [m for m in self._models if self._cooling.get(m, 0) <= now]
        cooling = sorted((m for m in self._models if m not in ready), key=self._cooling.__getitem__)
        return ready + cooling

    def _cool(self, model: str, seconds: float) -> None:
        # Never shorten a cooldown (a used-up daily quota stays used up after a later 503).
        until = max(self._cooling.get(model, 0.0), self._clock() + seconds)
        self._cooling[model] = until
        log.info("gemini model cooling", extra={"model": model, "seconds": round(seconds)})

    def generate(self, request: GenerationRequest) -> list[object]:
        prompt = build_prompt(request)
        order = self._order()
        failure: Exception = ProviderBusy("no tries")
        for attempt in range(MAX_TRIES):
            model = order[attempt % len(order)]
            try:
                config = self._slow_config if model.startswith("gemma") else self._config
                response = self._client.models.generate_content(
                    model=model, contents=prompt, config=config
                )
                cards = _cards_from(response.text)
                self._cooling.pop(model, None)
                log.info("gemini answered", extra={"model": model, "try": attempt + 1})
                return cards
            except (errors.ClientError, errors.ServerError) as e:
                if e.code in BUSY_STATUS:
                    self._cool(model, cooldown_after(e) if e.code == 429 else COOLDOWN_SECONDS)
                    failure = ProviderBusy(f"{model} {e.code}")
                elif e.code == 404 and len(self._models) > 1:
                    self._cool(model, cooldown_after(e))  # retired: use the others
                    failure = ProviderFailed(f"{model} not found")
                else:
                    raise ProviderFailed(f"{model} {e.code} {e.status}") from e
            except (httpx.TimeoutException, httpx.TransportError) as e:
                self._cool(model, COOLDOWN_SECONDS)
                failure = ProviderBusy(f"{model} {type(e).__name__}")
            except ProviderFailed as e:  # unusable answer: try another model, no cooldown
                failure = ProviderFailed(f"{model}: {e}")
            if attempt + 1 < MAX_TRIES:
                delay = random.uniform(0, BACKOFF_BASE_SECONDS * 2**attempt)
                log.info("gemini retry", extra={"attempt": attempt + 1, "reason": str(failure)})
                self._sleep(delay)
        raise failure


def _cards_from(text: str | None) -> list[object]:
    """The "cards" array of the model's JSON answer. Items are checked later by clean_cards()."""
    if not text:
        # Blocked by safety filters, or cut off before any output.
        raise ProviderFailed("returned no text")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ProviderFailed("returned invalid JSON") from e
    cards = data.get("cards") if isinstance(data, dict) else data
    if not isinstance(cards, list):
        raise ProviderFailed("JSON has no cards list")
    return cards
