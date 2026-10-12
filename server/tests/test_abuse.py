"""Protection against spam: per-address limits and no public API docs."""

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
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404
    assert fastapi_app.openapi_url is None


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
