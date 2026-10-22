"""Play Integrity tickets (roadmap 6.0): a phone Google Play vouches for is counted by the phone,
everything else by its install id, exactly as before."""

import json
import logging
import time
from uuid import UUID

import pytest

from app import integrity
from app.config import get_settings
from tests.conftest import DEVICE

PHONE = "ab" * 32  # what the app sends: SHA-256 (hex) of its Android ID
OTHER_PHONE = "cd" * 32
NEW_INSTALL = "0b6f1e2d-9c8b-4a7f-b6e5-d4c3b2a1f0e9"  # the same phone after a reinstall
TICKET = "eyJ-a-ticket-from-google-play"
NOW = 1_800_000_000_000
TEXT = ". ".join(f"Fact number {i} is true" for i in range(40)) + "."


def payload(phone=PHONE, at=NOW, **changes):
    """What Google says about a good ticket, with `changes` replacing whole sections."""
    answer = {
        "requestDetails": {
            "requestPackageName": "com.recapcards.app",
            "requestHash": phone,
            "timestampMillis": str(at),
        },
        "appIntegrity": {"appRecognitionVerdict": "PLAY_RECOGNIZED"},
        "deviceIntegrity": {"deviceRecognitionVerdict": ["MEETS_DEVICE_INTEGRITY"]},
        "accountDetails": {"appLicensingVerdict": "LICENSED"},
    }
    answer.update(changes)
    return answer


def verdict(answer, phone=PHONE, now=NOW):
    return integrity.verdict(answer, phone, "com.recapcards.app", now)


@pytest.fixture
def check_on(monkeypatch):
    """Turns the check on, with Google's answers coming from `google.answer` (a fresh good
    ticket by default) instead of the network."""

    class Google:
        calls = 0
        answer = None  # None: a good ticket for whatever phone_id the request sends

        def decode(self, token, settings):
            self.calls += 1
            if callable(self.answer):
                return self.answer()
            return self.answer if self.answer is not None else payload(at=int(time.time() * 1000))

    google = Google()
    monkeypatch.setattr(get_settings(), "play_integrity_credentials", '{"type": "service_account"}')
    monkeypatch.setattr(integrity, "decode", google.decode)
    return google


def generate(client, device=DEVICE, phone=PHONE, ticket=TICKET, cards=10):
    body = {"device_id": device, "text": TEXT, "max_cards": cards}
    if phone:
        body["phone_id"] = phone
    if ticket:
        body["integrity_token"] = ticket
    return client.post("/v1/generate", json=body)


def shown(client, device=DEVICE, phone=PHONE):
    params = {"device_id": device} | ({"phone_id": phone} if phone else {})
    return client.get("/v1/quota", params=params).json()


# What a ticket must say


def test_a_good_ticket_passes():
    assert verdict(payload()) == "passed"


def test_test_answers_from_play_console_pass_but_are_told_apart():
    assert verdict(payload(testingDetails={"isTestingResponse": True})) == "passed-test"


@pytest.mark.parametrize(
    ("answer", "why"),
    [
        (
            payload(requestDetails={"requestPackageName": "com.other.app", "requestHash": PHONE}),
            "failed:package",
        ),
        (payload(phone=OTHER_PHONE), "failed:phone"),  # made for another phone
        (payload(at=NOW - 16 * 60 * 1000), "failed:time"),  # too old
        (payload(at=NOW + 5 * 60 * 1000), "failed:time"),  # from the future
        (
            payload(
                requestDetails={"requestPackageName": "com.recapcards.app", "requestHash": PHONE}
            ),
            "failed:time",
        ),  # no time
        (payload(appIntegrity={"appRecognitionVerdict": "UNRECOGNIZED_VERSION"}), "failed:app"),
        (payload(appIntegrity={"appRecognitionVerdict": "UNEVALUATED"}), "failed:app"),  # reused
        (payload(appIntegrity={}), "failed:app"),
        (payload(deviceIntegrity={"deviceRecognitionVerdict": []}), "failed:device"),  # emulator
        (payload(deviceIntegrity={}), "failed:device"),
        (
            payload(deviceIntegrity={"deviceRecognitionVerdict": ["MEETS_BASIC_INTEGRITY"]}),
            "failed:device",
        ),
        ({}, "failed:package"),
    ],
)
def test_tickets_that_dont_pass(answer, why):
    assert verdict(answer) == why


def test_strong_integrity_passes_and_licensing_is_not_required():
    strong = payload(
        deviceIntegrity={"deviceRecognitionVerdict": ["MEETS_STRONG_INTEGRITY"]},
        accountDetails={"appLicensingVerdict": "UNLICENSED"},
    )
    assert verdict(strong) == "passed"


def test_a_little_clock_difference_is_fine():
    assert verdict(payload(at=NOW + 30_000)) == "passed"
    assert verdict(payload(at=NOW - 14 * 60 * 1000)) == "passed"


def test_the_trusted_id_is_stable_per_phone_and_never_an_install_id():
    phone = UUID(integrity.trusted_id(PHONE))
    assert phone.version == 5 and UUID(DEVICE).version == 4
    assert integrity.trusted_id(PHONE) == str(phone)
    assert integrity.trusted_id(OTHER_PHONE) != str(phone)


# check(): never blocks, never asks Google without a reason


def test_off_by_default_and_then_google_is_never_asked(monkeypatch):
    assert get_settings().play_integrity_credentials == ""
    monkeypatch.setattr(integrity, "decode", lambda *_: pytest.fail("asked Google"))
    assert integrity.check(PHONE, TICKET, get_settings()) is None


def test_no_ticket_or_no_phone_means_the_install_id(check_on):
    assert integrity.check(PHONE, None, get_settings()) is None
    assert integrity.check(None, TICKET, get_settings()) is None
    assert check_on.calls == 0


def test_a_passing_ticket_gives_the_phones_id(check_on):
    assert integrity.check(PHONE, TICKET, get_settings()) == integrity.trusted_id(PHONE)


def test_not_a_ticket_at_all(check_on):
    check_on.answer = lambda: None  # Google said 400
    assert integrity.check(PHONE, TICKET, get_settings()) is None


def test_google_trouble_never_blocks_and_busy_is_a_warning(check_on, caplog):
    def busy():
        raise integrity.GoogleBusy

    def down():
        raise ConnectionError("no route")

    check_on.answer = busy
    with caplog.at_level(logging.INFO, logger="app.integrity"):
        assert integrity.check(PHONE, TICKET, get_settings()) is None
    assert [(r.levelname, r.result) for r in caplog.records] == [("WARNING", "google-busy")]

    check_on.answer = down
    assert integrity.check(PHONE, TICKET, get_settings()) is None


def test_an_odd_answer_from_google_never_blocks(check_on):
    check_on.answer = lambda: ["not", "a", "dict"]
    assert integrity.check(PHONE, TICKET, get_settings()) is None


# The endpoints


def test_requests_without_a_ticket_work_as_before(client, check_on):
    response = generate(client, phone=None, ticket=None)
    assert response.status_code == 200
    assert response.json()["remaining"] == 40
    assert shown(client, phone=None) == {"remaining": 40, "limit": 50}
    assert check_on.calls == 0


def test_a_vouched_for_phone_keeps_its_count_through_a_reinstall(client, check_on):
    assert shown(client) == {"remaining": 50, "limit": 50}  # never seen: the install's (full)
    assert generate(client, cards=30).json()["remaining"] == 20
    assert shown(client) == {"remaining": 20, "limit": 50}

    # Reinstalled: a new install id, the same phone. The screen and the next request agree.
    assert shown(client, device=NEW_INSTALL) == {"remaining": 20, "limit": 50}
    second = generate(client, device=NEW_INSTALL, cards=30)
    assert len(second.json()["cards"]) == 20
    assert second.json()["remaining"] == 0
    third = generate(client, device=NEW_INSTALL, cards=5)
    assert third.status_code == 429
    assert third.json()["error"] == "quota_exceeded"


def test_a_failing_ticket_counts_by_the_install_id(client, check_on):
    check_on.answer = lambda: payload(
        at=int(time.time() * 1000), deviceIntegrity={"deviceRecognitionVerdict": []}
    )
    assert generate(client).json()["remaining"] == 40
    assert generate(client, device=NEW_INSTALL).json()["remaining"] == 40  # a new install: new
    assert shown(client) == {"remaining": 40, "limit": 50}  # the phone never passed


def test_google_being_down_still_makes_cards(client, check_on):
    def down():
        raise TimeoutError

    check_on.answer = down
    response = generate(client)
    assert response.status_code == 200
    assert response.json()["remaining"] == 40


def test_when_the_check_is_off_tickets_are_ignored(client, monkeypatch):
    monkeypatch.setattr(integrity, "decode", lambda *_: pytest.fail("asked Google"))
    assert generate(client).json()["remaining"] == 40
    assert generate(client, device=NEW_INSTALL).json()["remaining"] == 40
    assert shown(client) == {"remaining": 40, "limit": 50}


def test_while_the_check_is_off_everyone_keeps_the_full_allowance(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "unverified_daily_card_quota", 20)
    assert shown(client, phone=None) == {"remaining": 50, "limit": 50}
    assert generate(client, phone=None, ticket=None, cards=30).json()["remaining"] == 20


def test_the_no_ticket_allowance_can_be_lowered_on_its_own(client, check_on, monkeypatch):
    monkeypatch.setattr(get_settings(), "unverified_daily_card_quota", 20)
    assert shown(client, phone=None) == {"remaining": 20, "limit": 20}
    old_app = generate(client, phone=None, ticket=None, cards=30)
    assert len(old_app.json()["cards"]) == 20
    assert old_app.json()["remaining"] == 0
    blocked = generate(client, phone=None, ticket=None, cards=5)
    assert blocked.json()["message"] == "You've made 20 AI cards today. More tomorrow!"

    phone = generate(client, device=NEW_INSTALL, cards=30)  # a phone Google vouches for
    assert phone.json()["remaining"] == 20
    assert shown(client, device=NEW_INSTALL) == {"remaining": 20, "limit": 50}


def test_a_used_up_network_never_asks_google(client, check_on, monkeypatch):
    monkeypatch.setattr(get_settings(), "ip_daily_card_quota", 10)
    assert generate(client, cards=10).status_code == 200
    assert generate(client, cards=10).json()["error"] == "ip_quota_exceeded"
    assert check_on.calls == 1


def test_a_malformed_phone_id_is_refused(client):
    assert generate(client, phone="not-a-hash").status_code == 422
    assert (
        client.get("/v1/quota", params={"device_id": DEVICE, "phone_id": "ABC"}).status_code == 422
    )


def test_logs_never_contain_the_ticket_or_ids(client, check_on, caplog):
    with caplog.at_level(logging.INFO):
        generate(client)
        generate(client, phone=None, ticket=None)
    text = caplog.text + " ".join(str(vars(r)) for r in caplog.records)
    for secret in (TICKET, PHONE, integrity.trusted_id(PHONE), DEVICE):
        assert secret not in text
    results = [r.result for r in caplog.records if r.name == "app.integrity"]
    assert results == ["passed", "missing"]


# The call to Google itself (the network is replaced by a stand-in)


class FakeResponse:
    def __init__(self, status, body=None):
        self.status_code = status
        self._body = body or {}

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


@pytest.mark.parametrize(
    ("status", "body", "expected"),
    [
        (200, {"tokenPayloadExternal": {"requestDetails": {}}}, {"requestDetails": {}}),
        (400, {}, None),  # not a ticket
        (429, {}, integrity.GoogleBusy),
        (500, {}, RuntimeError),
    ],
)
def test_decode_reads_googles_answer(monkeypatch, status, body, expected):
    sent = {}

    class Session:
        def post(self, url, json, timeout):
            sent.update(url=url, json=json, timeout=timeout)
            return FakeResponse(status, body)

    monkeypatch.setattr(integrity, "_session", lambda _: Session())
    settings = get_settings()
    if isinstance(expected, type):
        with pytest.raises(expected):
            integrity.decode(TICKET, settings)
    else:
        assert integrity.decode(TICKET, settings) == expected
    assert sent["url"] == (
        "https://playintegrity.googleapis.com/v1/com.recapcards.app:decodeIntegrityToken"
    )
    assert sent["json"] == {"integrity_token": TICKET}
    assert sent["timeout"] == integrity.TIMEOUT_S


def test_the_service_account_key_is_read_without_calling_google():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    info = {
        "type": "service_account",
        "client_email": "recap-integrity@example.iam.gserviceaccount.com",
        "private_key": pem,
        "private_key_id": "1",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    session = integrity._session(json.dumps(info))
    assert session.credentials.service_account_email == info["client_email"]
    assert session.credentials.scopes == [integrity.SCOPE]
    integrity._session.cache_clear()
