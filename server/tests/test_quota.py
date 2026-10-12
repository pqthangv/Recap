from datetime import UTC, date, datetime

from app import quota
from tests.conftest import DEVICE

DAY = date(2026, 10, 11)


def test_new_devices_start_with_the_full_quota(client):
    response = client.get("/v1/quota", params={"device_id": DEVICE})
    assert response.json() == {"remaining": 50, "limit": 50}


def test_reserve_takes_what_is_left_and_refund_gives_it_back(engine):
    assert quota.reserve(engine, DEVICE, DAY, 30, 50) == 30
    assert quota.reserve(engine, DEVICE, DAY, 30, 50) == 20  # only 20 left
    assert quota.reserve(engine, DEVICE, DAY, 5, 50) == 0
    quota.refund(engine, DEVICE, DAY, 12)
    assert quota.remaining(engine, DEVICE, DAY, 50) == 12
    quota.refund(engine, DEVICE, DAY, 999)  # never below zero used
    assert quota.used_today(engine, DEVICE, DAY) == 38


def test_each_device_and_each_utc_day_has_its_own_quota(engine):
    other = "0b6f1e2d-9c8b-4a7f-b6e5-d4c3b2a1f0e9"
    quota.reserve(engine, DEVICE, DAY, 50, 50)
    assert quota.remaining(engine, other, DAY, 50) == 50
    assert quota.remaining(engine, DEVICE, date(2026, 10, 12), 50) == 50


def test_the_day_is_utc():
    late_in_vietnam = datetime(2026, 10, 12, 1, 30, tzinfo=UTC)
    assert quota.today_utc(late_in_vietnam) == date(2026, 10, 12)


def test_generating_uses_the_quota_until_it_runs_out(client):
    text = ". ".join(f"Fact number {i} is true" for i in range(40)) + "."
    first = client.post("/v1/generate", json={"device_id": DEVICE, "text": text, "max_cards": 30})
    assert first.status_code == 200
    assert len(first.json()["cards"]) == 30
    assert first.json()["remaining"] == 20

    second = client.post("/v1/generate", json={"device_id": DEVICE, "text": text, "max_cards": 30})
    assert len(second.json()["cards"]) == 20  # capped by what was left
    assert second.json()["remaining"] == 0

    third = client.post("/v1/generate", json={"device_id": DEVICE, "text": text, "max_cards": 5})
    assert third.status_code == 429
    assert third.json() == {
        "error": "quota_exceeded",
        "message": "You've made 50 AI cards today. More tomorrow!",
        "remaining": 0,
    }


def test_only_cards_actually_made_are_counted(client):
    response = client.post(
        "/v1/generate",
        json={"device_id": DEVICE, "text": "Water boils at 100 °C.", "max_cards": 10},
    )
    assert len(response.json()["cards"]) == 1
    assert response.json()["remaining"] == 49
