"""Gemini provider with the API mocked: retries, backoff, model fallback and unusable answers."""

from types import SimpleNamespace

import httpx
import pytest
from google.genai import errors, types

from app.llm.base import GenerationRequest, ProviderBlocked, ProviderBusy, ProviderFailed
from app.llm.gemini import GeminiProvider, _cards_from, parse_models

REQUEST = GenerationRequest(text="Water boils at 100 °C.", mode="text", max_cards=5)


class FakeModels:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        if isinstance(outcome, SimpleNamespace):  # a whole response, e.g. a refusal
            return outcome
        return SimpleNamespace(text=outcome)

    @property
    def models_called(self):
        return [call["model"] for call in self.calls]


def provider(*outcomes, models=("model-a",)):
    fake = FakeModels(outcomes)
    sleeps: list[float] = []
    p = GeminiProvider("key", models, client=SimpleNamespace(models=fake), sleep=sleeps.append)
    return p, fake, sleeps


def api_error(cls, code, status):
    return cls(code, {"error": {"code": code, "status": status, "message": status}})


RATE_LIMITED = api_error(errors.ClientError, 429, "RESOURCE_EXHAUSTED")
OVERLOADED = api_error(errors.ServerError, 503, "UNAVAILABLE")
NOT_FOUND = api_error(errors.ClientError, 404, "NOT_FOUND")
GOOD = '{"cards": [{"front": "Boiling point of water?", "back": "100 °C"}]}'


def test_returns_the_cards_array():
    p, fake, sleeps = provider(GOOD)
    assert p.generate(REQUEST) == [{"front": "Boiling point of water?", "back": "100 °C"}]
    call = fake.calls[0]
    assert call["model"] == "model-a"
    assert call["config"].response_mime_type == "application/json"
    assert "<study_material>\nWater boils at 100 °C.\n</study_material>" in call["contents"]
    assert sleeps == []


def test_retries_rate_limits_and_overload_with_growing_jittered_backoff():
    p, fake, sleeps = provider(RATE_LIMITED, OVERLOADED, GOOD)
    assert len(p.generate(REQUEST)) == 1
    assert len(fake.calls) == 3
    assert len(sleeps) == 2
    assert 0 <= sleeps[0] <= 1.0 and 0 <= sleeps[1] <= 2.0


def test_gives_up_after_three_tries():
    p, fake, sleeps = provider(RATE_LIMITED, RATE_LIMITED, httpx.ReadTimeout("slow"))
    with pytest.raises(ProviderBusy):
        p.generate(REQUEST)
    assert len(fake.calls) == 3
    assert len(sleeps) == 2


def test_a_rate_limited_model_hands_over_to_the_next_one():
    p, fake, _ = provider(RATE_LIMITED, GOOD, models=("model-a", "model-b"))
    assert len(p.generate(REQUEST)) == 1
    assert fake.models_called == ["model-a", "model-b"]


def test_models_take_turns_until_the_tries_run_out():
    p, fake, _ = provider(RATE_LIMITED, OVERLOADED, RATE_LIMITED, models=("model-a", "model-b"))
    with pytest.raises(ProviderBusy):
        p.generate(REQUEST)
    assert fake.models_called == ["model-a", "model-b", "model-a"]


def test_a_retired_model_is_skipped_when_there_is_another():
    p, fake, _ = provider(NOT_FOUND, GOOD, models=("old-model", "model-b"))
    assert len(p.generate(REQUEST)) == 1
    assert fake.models_called == ["old-model", "model-b"]
    alone, fake, _ = provider(NOT_FOUND)
    with pytest.raises(ProviderFailed):
        alone.generate(REQUEST)
    assert len(fake.calls) == 1


def test_an_unusable_answer_gets_another_try():
    p, fake, _ = provider("not json", GOOD, models=("model-a", "model-b"))
    assert len(p.generate(REQUEST)) == 1
    assert fake.models_called == ["model-a", "model-b"]


def test_does_not_retry_other_errors():
    p, fake, _ = provider(api_error(errors.ClientError, 400, "INVALID_ARGUMENT"))
    with pytest.raises(ProviderFailed):
        p.generate(REQUEST)
    assert len(fake.calls) == 1


PROMPT_BLOCKED = SimpleNamespace(
    text=None, prompt_feedback=SimpleNamespace(block_reason=types.BlockedReason.SAFETY)
)
ANSWER_STOPPED = SimpleNamespace(
    text=None,
    prompt_feedback=None,
    candidates=[SimpleNamespace(finish_reason=types.FinishReason.PROHIBITED_CONTENT)],
)
INPUT_BLOCKED = errors.ClientError(
    400, {"error": {"code": 400, "status": "INVALID_ARGUMENT", "message": "Input blocked: safety"}}
)


@pytest.mark.parametrize("refusal", [PROMPT_BLOCKED, ANSWER_STOPPED, INPUT_BLOCKED])
def test_a_refusal_is_not_retried_on_another_model(refusal):
    p, fake, sleeps = provider(refusal, GOOD, GOOD, models=("model-a", "model-b"))
    with pytest.raises(ProviderBlocked):
        p.generate(REQUEST)
    assert fake.models_called == ["model-a"]
    assert sleeps == []
    assert p._order() == ["model-a", "model-b"]  # the model isn't put to cool down


def test_an_answer_cut_off_by_length_is_not_a_refusal():
    cut = SimpleNamespace(
        text=None, candidates=[SimpleNamespace(finish_reason=types.FinishReason.MAX_TOKENS)]
    )
    p, fake, _ = provider(cut, GOOD, models=("model-a", "model-b"))
    assert len(p.generate(REQUEST)) == 1
    assert fake.models_called == ["model-a", "model-b"]


@pytest.mark.parametrize("answer", [None, "", "not json", '{"cards": "nope"}', '{"other": []}'])
def test_unusable_answers_fail_cleanly(answer):
    p, fake, _ = provider(answer, answer, answer)
    with pytest.raises(ProviderFailed):
        p.generate(REQUEST)
    assert len(fake.calls) == 3


def test_model_setting_can_list_several():
    assert parse_models("gemini-a, gemini-b ,") == ["gemini-a", "gemini-b"]
    assert parse_models("gemini-a") == ["gemini-a"]
    with pytest.raises(ValueError):
        parse_models(" , ")


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def cooling_provider(*outcomes, models=("model-a", "model-b", "model-c")):
    fake = FakeModels(outcomes)
    clock = Clock()
    p = GeminiProvider(
        "key", models, client=SimpleNamespace(models=fake), sleep=lambda _s: None, clock=clock
    )
    return p, fake, clock


def daily_quota_error():
    return errors.ClientError(
        429,
        {
            "error": {
                "code": 429,
                "status": "RESOURCE_EXHAUSTED",
                "message": "Quota exceeded",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                        "violations": [
                            {"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}
                        ],
                    }
                ],
            }
        },
    )


def per_minute_error(seconds: int):
    return errors.ClientError(
        429,
        {
            "error": {
                "code": 429,
                "status": "RESOURCE_EXHAUSTED",
                "message": "Quota exceeded",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.RetryInfo",
                        "retryDelay": f"{seconds}s",
                    }
                ],
            }
        },
    )


def test_a_rate_limited_model_is_skipped_by_later_requests_until_it_cools_down():
    p, fake, clock = cooling_provider(RATE_LIMITED, GOOD, GOOD, GOOD)
    p.generate(REQUEST)
    assert fake.models_called == ["model-a", "model-b"]
    p.generate(REQUEST)  # model-a is cooling: start with model-b
    assert fake.models_called[-1] == "model-b"
    clock.now += 61
    p.generate(REQUEST)  # cooled down: back to the best model
    assert fake.models_called[-1] == "model-a"


def test_a_used_up_daily_quota_cools_for_an_hour():
    p, fake, clock = cooling_provider(daily_quota_error(), GOOD, GOOD, GOOD)
    p.generate(REQUEST)
    clock.now += 30 * 60
    p.generate(REQUEST)
    assert fake.models_called[-1] == "model-b"
    clock.now += 31 * 60
    p.generate(REQUEST)
    assert fake.models_called[-1] == "model-a"


def test_googles_suggested_retry_delay_is_used():
    p, fake, clock = cooling_provider(per_minute_error(5), GOOD, GOOD)
    p.generate(REQUEST)
    clock.now += 6
    p.generate(REQUEST)
    assert fake.models_called[-1] == "model-a"


def test_when_every_model_is_cooling_the_soonest_one_is_tried():
    p, fake, clock = cooling_provider(
        daily_quota_error(), RATE_LIMITED, OVERLOADED, GOOD, models=("model-a", "model-b")
    )
    with pytest.raises(ProviderBusy):
        p.generate(REQUEST)  # a (daily), b (60 s), a again
    p.generate(REQUEST)
    assert fake.models_called[-1] == "model-b"  # cools down before model-a


def test_gemma_gets_more_time_than_gemini():
    p, fake, _ = provider(RATE_LIMITED, GOOD, models=("gemini-x", "gemma-4-31b-it"))
    p.generate(REQUEST)
    gemini_call, gemma_call = fake.calls
    assert gemini_call["config"].http_options is None  # the client's 25 s timeout
    assert gemma_call["config"].http_options.timeout == 60_000
    assert gemma_call["config"].response_schema is gemini_call["config"].response_schema


def test_latex_without_escaped_backslashes_still_parses():
    # The model wrote \sqrt and \pi as is: not valid JSON escapes, so a strict parse fails.
    unescaped = r'{"cards": [{"front": "What is \sqrt{2} + \pi?", "back": "about 4.56"}]}'
    assert _cards_from(unescaped) == [{"front": r"What is \sqrt{2} + \pi?", "back": "about 4.56"}]
    # Properly escaped JSON is read exactly as before.
    escaped = r'{"cards": [{"front": "\\sqrt{2} é", "back": "line\nbreak"}]}'
    assert _cards_from(escaped) == [{"front": r"\sqrt{2} é", "back": "line\nbreak"}]
