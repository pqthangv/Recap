"""Protection against spam: per-address limits and no public API docs."""

import pytest

from app import quota
from app.config import get_settings
from app.main import app as fastapi_app
from tests.conftest import DEVICE

OTHER_DEVICE = "0b6f1e2d-9c8b-4a7f-b6e5-d4c3b2a1f0e9"


def generate(client, device=DEVICE, ip="203.0.113.7", cards=10):
    return client.post(
        "/v1/generate",
        json={
            "device_id": device,
            "text": ". ".join(f"Fact {i} holds" for i in range(40)),
            "max_cards": cards,
        },
        headers={"cf-connecting-ip": ip},
    )


def test_no_public_api_docs(client):
    assert get_settings().enable_docs is False
    assert get_settings().admin_token == ""
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404
    assert fastapi_app.openapi_url is None  # FastAPI's own open docs are never on


def test_docs_need_the_admin_token(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_token", "s3cret-token")
    missing = client.get("/docs")
    assert missing.status_code == 401
    assert missing.headers["www-authenticate"].startswith("Basic")  # browser shows a login box
    assert client.get("/openapi.json", auth=("admin", "wrong")).status_code == 401
    page = client.get("/docs", auth=("admin", "s3cret-token"))
    assert page.status_code == 200
    assert "swagger" in page.text.lower()
    schema = client.get("/openapi.json", auth=("admin", "s3cret-token")).json()
    assert "/v1/generate" in schema["paths"]
    assert "/openapi.json" not in schema["paths"]  # the docs pages aren't listed themselves
    assert client.get("/redoc", auth=("admin", "s3cret-token")).status_code == 200


def test_docs_are_open_locally_with_enable_docs(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "enable_docs", True)
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_too_many_requests_from_one_address_are_refused(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "ip_requests_per_minute", 3)
    quota = lambda ip: client.get(  # noqa: E731
        "/v1/quota", params={"device_id": DEVICE}, headers={"cf-connecting-ip": ip}
    )
    assert [quota("198.51.100.1").status_code for _ in range(3)] == [200, 200, 200]
    limited = quota("198.51.100.1")
    assert limited.status_code == 429
    assert limited.json()["error"] == "rate_limited"
    assert quota("198.51.100.2").status_code == 200  # other people aren't affected
    assert client.get("/health").status_code == 200  # uptime pings never count


def test_a_faked_forwarded_for_header_does_not_dodge_the_limit(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "ip_requests_per_minute", 2)

    def quota(fake):
        return client.get(
            "/v1/quota",
            params={"device_id": DEVICE},
            headers={"cf-connecting-ip": "198.51.100.9", "x-forwarded-for": fake},
        )

    assert quota("1.1.1.1").status_code == 200
    assert quota("2.2.2.2").status_code == 200
    assert quota("3.3.3.3").status_code == 429


def test_inventing_device_ids_hits_the_per_address_card_limit(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "ip_daily_card_quota", 25)
    first = generate(client, device=DEVICE, cards=20)
    assert len(first.json()["cards"]) == 20
    second = generate(client, device=OTHER_DEVICE, cards=20)  # a "new phone", same network
    assert len(second.json()["cards"]) == 5
    third = generate(client, device="11111111-2222-4333-8444-555555555555", cards=5)
    assert third.status_code == 429
    assert third.json()["error"] == "ip_quota_exceeded"
    # Another network still works.
    assert generate(client, device=OTHER_DEVICE, ip="192.0.2.50", cards=5).status_code == 200


def test_cards_that_were_not_made_go_back_to_the_address(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "ip_daily_card_quota", 10)
    busy = client.post(
        "/v1/generate",
        json={"device_id": DEVICE, "text": "[fake:busy] x", "max_cards": 10},
        headers={"cf-connecting-ip": "203.0.113.20"},
    )
    assert busy.status_code == 503
    ok = client.post(
        "/v1/generate",
        json={"device_id": DEVICE, "text": "One fact here.", "max_cards": 10},
        headers={"cf-connecting-ip": "203.0.113.20"},
    )
    assert ok.status_code == 200  # nothing was used up by the failed request


NETWORK = "203.0.113.30"
ELSEWHERE = "192.0.2.99"


def left(client, device=DEVICE, ip=NETWORK):
    response = client.get(
        "/v1/quota", params={"device_id": device}, headers={"cf-connecting-ip": ip}
    )
    return response.json()["remaining"]


def fail(client, text, device=DEVICE, ip=NETWORK, cards=10):
    return client.post(
        "/v1/generate",
        json={"device_id": device, "text": text, "max_cards": cards},
        headers={"cf-connecting-ip": ip},
    )


@pytest.mark.parametrize("text", ["[fake:blocked] x", "[fake:garbage] x"])
def test_a_failed_request_costs_the_phone_nothing_but_counts_for_its_network(
    client, engine, monkeypatch, text
):
    monkeypatch.setattr(get_settings(), "ip_daily_card_quota", 25)
    failed = fail(client, text, cards=20)
    assert failed.status_code == 422
    assert failed.json()["remaining"] == 5  # the phone has all 50; the network 25 - 20
    assert quota.used_today(engine, DEVICE, quota.today_utc()) == 0  # the phone: nothing used
    # Another phone on the same network gets only what the network has left.
    assert len(generate(client, device=OTHER_DEVICE, ip=NETWORK, cards=10).json()["cards"]) == 5


def test_repeated_failures_use_up_the_network_not_the_phone(client, engine, monkeypatch):
    monkeypatch.setattr(get_settings(), "ip_daily_card_quota", 30)
    for _ in range(3):
        assert fail(client, "[fake:blocked] x", cards=10).status_code == 422
    stopped = fail(client, "[fake:blocked] x", cards=10)
    assert stopped.status_code == 429
    assert stopped.json()["error"] == "ip_quota_exceeded"
    assert quota.used_today(engine, DEVICE, quota.today_utc()) == 0
    assert generate(client, ip=ELSEWHERE, cards=10).status_code == 200  # its own 50 are intact


def test_a_phone_with_cards_left_on_a_used_up_network(client, engine, monkeypatch):
    monkeypatch.setattr(get_settings(), "ip_daily_card_quota", 10)
    assert generate(client, device=OTHER_DEVICE, ip=NETWORK, cards=10).status_code == 200
    assert left(client) == 0  # this phone used nothing, but its network has used everything
    out = generate(client, ip=NETWORK, cards=5)
    assert out.status_code == 429
    assert out.json() == {
        "error": "ip_quota_exceeded",
        "message": "Lots of AI cards were made from your network today. More tomorrow!",
        "remaining": 0,
    }
    assert quota.used_today(engine, DEVICE, quota.today_utc()) == 0  # it keeps all of its own
    assert left(client, ip=ELSEWHERE) == 10  # elsewhere: that network's (test) limit of 10


def test_a_network_with_a_few_cards_left_gives_just_those(client, engine, monkeypatch):
    monkeypatch.setattr(get_settings(), "ip_daily_card_quota", 13)
    assert generate(client, device=OTHER_DEVICE, ip=NETWORK, cards=10).status_code == 200
    assert left(client) == 3
    some = generate(client, ip=NETWORK, cards=10)
    assert len(some.json()["cards"]) == 3
    assert some.json()["remaining"] == 0
    assert quota.used_today(engine, DEVICE, quota.today_utc()) == 3


def test_the_phones_own_limit_shows_when_it_is_the_lower_one(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "daily_card_quota", 12)
    assert generate(client, ip=NETWORK, cards=10).status_code == 200
    assert left(client) == 2  # the network still has 190 of its 200
    assert left(client, device=OTHER_DEVICE) == 12
