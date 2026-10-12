from app import quota
from app.llm.base import GenerationRequest
from app.llm.cleaning import clean_cards
from app.llm.prompt import build_prompt
from tests.conftest import DEVICE


def post(client, **body):
    return client.post("/v1/generate", json={"device_id": DEVICE, **body})


def test_makes_cards_from_text(client):
    response = post(client, text="chat - cat\nchien - dog", max_cards=10)
    assert response.status_code == 200
    assert response.json()["cards"] == [
        {"front": "chat", "back": "cat"},
        {"front": "chien", "back": "dog"},
    ]


def test_topic_mode(client):
    response = post(client, text="Photosynthesis", mode="topic", max_cards=3)
    assert [c["front"] for c in response.json()["cards"]] == [
        "Photosynthesis: question 1?",
        "Photosynthesis: question 2?",
        "Photosynthesis: question 3?",
    ]


def test_rejects_oversized_input(client):
    too_long = post(client, text="a" * 15_001)
    assert too_long.status_code == 413
    assert too_long.json()["error"] == "too_long"
    assert post(client, text="x" * 201, mode="topic").json()["error"] == "too_long"
    # Bodies over the size limit are refused before they're read.
    huge = client.post(
        "/v1/generate",
        content=b'{"text": "' + b"a" * 300_000 + b'"}',
        headers={"content-type": "application/json"},
    )
    assert huge.status_code == 413
    assert huge.json()["error"] == "too_large"


def test_rejects_bad_requests_clearly(client):
    assert post(client, text="   ").json()["error"] == "empty"
    bad_device = client.post("/v1/generate", json={"device_id": "not-a-uuid", "text": "hi"})
    assert bad_device.status_code == 422
    assert bad_device.json()["error"] == "invalid_request"
    assert post(client, text="hi", max_cards=0).status_code == 422
    assert post(client, text="hi", mode="poem").status_code == 422


def test_max_cards_is_capped_at_30(client):
    text = ". ".join(f"Fact {i} holds" for i in range(60)) + "."
    assert len(post(client, text=text, max_cards=100).json()["cards"]) == 30


def test_malformed_model_output_is_handled_and_refunded(client, engine):
    response = post(client, text="[fake:garbage] anything", max_cards=10)
    assert response.status_code == 422
    assert response.json()["error"] == "no_cards"
    assert quota.used_today(engine, DEVICE, quota.today_utc()) == 0


def test_busy_ai_gives_a_clear_message_and_refunds(client, engine):
    response = post(client, text="[fake:busy] anything", max_cards=10)
    assert response.status_code == 503
    assert response.json() == {"error": "ai_busy", "message": "AI is busy, try again later."}
    assert quota.used_today(engine, DEVICE, quota.today_utc()) == 0


def test_clean_cards_keeps_only_usable_cards():
    raw = [
        {"front": "1. What is H2O?", "back": "**Water**"},
        {"front": "what is h2o", "back": "duplicate"},
        {"front": "", "back": "no front"},
        {"front": "No back"},
        {"front": "x" * 501, "back": "too long"},
        "not a dict",
        {"front": "Why is the sky blue?", "back": "  Rayleigh   scattering \n\n of light "},
        {"front": "Extra", "back": "over the limit"},
    ]
    assert [c.model_dump() for c in clean_cards(raw, max_cards=2)] == [
        {"front": "What is H2O?", "back": "Water"},
        {"front": "Why is the sky blue?", "back": "Rayleigh scattering\nof light"},
    ]


def test_prompt_keeps_to_the_source_and_its_language():
    text_prompt = build_prompt(GenerationRequest(text="Notes", mode="text", max_cards=5))
    assert "up to 5 flashcards" in text_prompt
    assert "Use only facts stated in it" in text_prompt
    assert "same language as the study material" in text_prompt
    assert "<study_material>\nNotes\n</study_material>" in text_prompt
    topic = build_prompt(
        GenerationRequest(text="Mitosis", mode="topic", max_cards=3, language="Vietnamese")
    )
    assert "about this topic: Mitosis" in topic
    assert "Write the cards in Vietnamese." in topic


def test_logs_never_contain_the_study_material(client, caplog):
    secret = "My private diary entry about Hanoi."
    with caplog.at_level("DEBUG"):
        assert post(client, text=secret, max_cards=3).status_code == 200
        post(client, text=f"[fake:busy] {secret}", max_cards=3)
    logged = " ".join(f"{r.getMessage()} {vars(r)}" for r in caplog.records)
    assert "generated" in logged
    assert "private diary" not in logged
