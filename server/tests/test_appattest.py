"""Apple App Attest (roadmap 6.0, 1.0.8): an iPhone Apple vouches for is counted by its key,
everything else by its install id, exactly as before. Real attestations need a real iPhone, so
these tests make a stand-in "Apple": a root and an intermediate certificate, and per key a
certificate with the attested nonce, the way Apple's are laid out."""

import base64
import hashlib
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from app import appattest
from app.config import get_settings
from tests.conftest import DEVICE

APP_ID = "4AN4UNX4PW.com.recapcards.app"
TEXT = ". ".join(f"Fact number {i} is true" for i in range(40)) + "."
NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)


def cbor(value) -> bytes:
    """Just enough of a CBOR encoder for what Apple sends: maps, arrays, bytes, text, numbers."""

    def head(major: int, n: int) -> bytes:
        if n < 24:
            return bytes([major << 5 | n])
        for extra, size in ((24, 1), (25, 2), (26, 4), (27, 8)):
            if n < 1 << (8 * size):
                return bytes([major << 5 | extra]) + n.to_bytes(size, "big")
        raise ValueError(n)

    if isinstance(value, bool) or value is None:
        raise TypeError(value)
    if isinstance(value, int):
        return head(0, value) if value >= 0 else head(1, -1 - value)
    if isinstance(value, bytes):
        return head(2, len(value)) + value
    if isinstance(value, str):
        data = value.encode()
        return head(3, len(data)) + data
    if isinstance(value, list):
        return head(4, len(value)) + b"".join(cbor(v) for v in value)
    if isinstance(value, dict):
        return head(5, len(value)) + b"".join(cbor(k) + cbor(v) for k, v in value.items())
    raise TypeError(value)


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def sha(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def name(text: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, text)])


def certificate(subject, subject_key, issuer, issuer_key, *, ca, extensions=(), days=365):
    builder = (
        x509.CertificateBuilder()
        .subject_name(name(subject))
        .issuer_name(name(issuer))
        .public_key(subject_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(NOW - timedelta(days=1))
        .not_valid_after(NOW + timedelta(days=days))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
    )
    for extension in extensions:
        builder = builder.add_extension(extension, critical=False)
    return builder.sign(
        issuer_key, hashes.SHA256() if subject_key.curve.key_size == 256 else hashes.SHA384()
    )


class Apple:
    """A stand-in for Apple's App Attest service."""

    def __init__(self) -> None:
        self.root_key = ec.generate_private_key(ec.SECP384R1())
        self.root = certificate("Test Root", self.root_key, "Test Root", self.root_key, ca=True)
        self.intermediate_key = ec.generate_private_key(ec.SECP384R1())
        self.intermediate = certificate(
            "Test CA 1", self.intermediate_key, "Test Root", self.root_key, ca=True
        )


class Phone:
    """An iPhone with Recap: its App Attest key and what it sends."""

    def __init__(self, apple: Apple) -> None:
        self.apple = apple
        self.key = ec.generate_private_key(ec.SECP256R1())
        point = self.key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        self.point = point
        self.key_bytes = sha(point)
        self.key_id = b64(self.key_bytes)
        self.counter = 0

    def attest(
        self,
        challenge: str,
        *,
        app_id=APP_ID,
        counter=0,
        aaguid=appattest.AAGUID_PRODUCTION,
        credential=None,
        nonce=None,
        leaf_days=365,
    ) -> str:
        credential = self.key_bytes if credential is None else credential
        auth_data = (
            sha(app_id.encode())
            + b"\x40"
            + counter.to_bytes(4, "big")
            + aaguid
            + len(credential).to_bytes(2, "big")
            + credential
        )
        nonce = nonce or sha(auth_data + sha(challenge.encode()))
        extension = x509.UnrecognizedExtension(
            appattest.NONCE_OID, bytes([0x30, 0x24, 0xA1, 0x22, 0x04, 0x20]) + nonce
        )
        leaf = certificate(
            "key",
            self.key,
            "Test CA 1",
            self.apple.intermediate_key,
            ca=False,
            extensions=[extension],
            days=leaf_days,
        )
        der = [c.public_bytes(serialization.Encoding.DER) for c in (leaf, self.apple.intermediate)]
        return b64(
            cbor(
                {
                    "fmt": "apple-appattest",
                    "attStmt": {"x5c": der, "receipt": b"r"},
                    "authData": auth_data,
                }
            )
        )

    def assert_(self, client_data: str, *, app_id=APP_ID, counter=None, key=None) -> str:
        if counter is None:
            self.counter += 1
            counter = self.counter
        auth_data = sha(app_id.encode()) + b"\x01" + counter.to_bytes(4, "big")
        signature = (key or self.key).sign(
            sha(auth_data + sha(client_data.encode())), ec.ECDSA(hashes.SHA256())
        )
        return b64(cbor({"signature": signature, "authenticatorData": auth_data}))


@pytest.fixture
def apple(monkeypatch):
    stand_in = Apple()
    monkeypatch.setattr(appattest, "_root", lambda: stand_in.root)
    return stand_in


def attestation_result(apple, phone, attestation, challenge="c", **options):
    return appattest.verify_attestation(
        phone.key_id, attestation, challenge, APP_ID, root=apple.root, now=NOW, **options
    )


# Registering a key: what an attestation must say


def test_a_good_attestation_gives_the_keys_public_half(apple):
    phone = Phone(apple)
    assert attestation_result(apple, phone, phone.attest("c")) == phone.point


@pytest.mark.parametrize(
    ("change", "why"),
    [
        ({"app_id": "4AN4UNX4PW.com.other.app"}, "failed:app"),
        ({"counter": 1}, "failed:counter"),  # a key that has been used already
        ({"aaguid": appattest.AAGUID_DEVELOPMENT}, "failed:environment"),  # a debug build
        ({"aaguid": b"x" * 16}, "failed:environment"),
        ({"credential": b"\x00" * 32}, "failed:key"),  # authData names another key
        ({"nonce": b"\x00" * 32}, "failed:nonce"),  # Apple attested something else
    ],
)
def test_attestations_that_dont_pass(apple, change, why):
    phone = Phone(apple)
    assert attestation_result(apple, phone, phone.attest("c", **change)) == why


def test_it_must_be_for_the_challenge_the_server_gave(apple):
    phone = Phone(apple)
    assert (
        attestation_result(apple, phone, phone.attest("c"), challenge="another") == "failed:nonce"
    )


def test_development_keys_only_when_turned_on(apple):
    phone = Phone(apple)
    attestation = phone.attest("c", aaguid=appattest.AAGUID_DEVELOPMENT)
    assert attestation_result(apple, phone, attestation, development=True) == phone.point


def test_it_must_be_this_keys_certificate(apple):
    phone, other = Phone(apple), Phone(apple)
    result = appattest.verify_attestation(
        other.key_id, phone.attest("c"), "c", APP_ID, root=apple.root, now=NOW
    )
    assert result == "failed:key"


def test_only_apples_certificates_count(apple):
    impostor = Apple()  # same names, other keys
    phone = Phone(impostor)
    assert attestation_result(apple, phone, phone.attest("c")) == "failed:chain"


def test_an_expired_certificate_fails(apple):
    phone = Phone(apple)
    old = phone.attest("c", leaf_days=-0.5)
    assert attestation_result(apple, phone, old) == "failed:chain"


@pytest.mark.parametrize(
    "attestation",
    [
        "",
        "not base64!",
        b64(b"\xff\x00"),  # not CBOR
        b64(cbor(["a", "list"])),
        b64(cbor({"fmt": "packed", "attStmt": {}, "authData": b""})),
        b64(cbor({"fmt": "apple-appattest", "attStmt": {"x5c": []}, "authData": b""})),
        b64(cbor({"fmt": "apple-appattest", "attStmt": {"x5c": [b"x", b"y"]}, "authData": b""})),
        "A" * (appattest.MAX_ATTESTATION_CHARS + 4),
    ],
)
def test_garbage_is_refused_not_an_error(apple, attestation):
    phone = Phone(apple)
    assert attestation_result(apple, phone, attestation).startswith("failed:")


# Each "Make cards": what an assertion must say


def test_a_good_assertion_moves_the_counter_on(apple):
    phone = Phone(apple)
    data = appattest.generate_client_data("text", TEXT)
    assert appattest.verify_assertion(phone.assert_(data), data, phone.point, 0, APP_ID) == 1
    assert appattest.verify_assertion(phone.assert_(data), data, phone.point, 1, APP_ID) == 2


def test_an_assertion_works_once(apple):
    phone = Phone(apple)
    data = appattest.generate_client_data("text", TEXT)
    sent = phone.assert_(data)
    assert appattest.verify_assertion(sent, data, phone.point, 1, APP_ID) == "failed:counter"


def test_an_assertion_is_for_one_request(apple):
    phone = Phone(apple)
    sent = phone.assert_(appattest.generate_client_data("text", TEXT))
    other = appattest.generate_client_data("text", "Something else entirely")
    assert appattest.verify_assertion(sent, other, phone.point, 0, APP_ID) == "failed:signature"


def test_another_key_or_app_fails(apple):
    phone = Phone(apple)
    data = appattest.generate_client_data("topic", "Volcanoes")
    forged = phone.assert_(data, key=ec.generate_private_key(ec.SECP256R1()))
    assert appattest.verify_assertion(forged, data, phone.point, 0, APP_ID) == "failed:signature"
    other_app = phone.assert_(data, app_id="4AN4UNX4PW.com.other.app")
    assert appattest.verify_assertion(other_app, data, phone.point, 0, APP_ID) == "failed:app"


@pytest.mark.parametrize(
    "assertion", ["", "%%%", b64(b"\x01"), b64(cbor({"signature": "text"})), "A" * 4000]
)
def test_garbage_assertions_are_refused(apple, assertion):
    phone = Phone(apple)
    result = appattest.verify_assertion(assertion, "x", phone.point, 0, APP_ID)
    assert result.startswith("failed:")


def test_the_trusted_id_is_stable_per_key_and_never_an_install_id(apple):
    phone, other = Phone(apple), Phone(apple)
    key = UUID(appattest.trusted_id(phone.key_id))
    assert key.version == 5 and UUID(DEVICE).version == 4
    assert appattest.trusted_id(phone.key_id) == str(key) != appattest.trusted_id(other.key_id)


# Challenges


def test_a_challenge_works_once_and_for_five_minutes():
    clock = [0.0]
    store = appattest.Challenges(clock=lambda: clock[0])
    first, second = store.issue(), store.issue()
    assert first != second
    assert store.take(first) and not store.take(first)
    clock[0] += appattest.CHALLENGE_TTL_S + 1
    assert not store.take(second)
    assert not store.take("never issued")


# The endpoints


def register(client, phone):
    challenge = client.post("/v1/attest/challenge").json()["challenge"]
    body = {"key_id": phone.key_id, "attestation": phone.attest(challenge), "challenge": challenge}
    return client.post("/v1/attest/key", json=body)


def generate(client, phone=None, *, text=TEXT, cards=10, assertion=None):
    body = {"device_id": DEVICE, "text": text, "max_cards": cards}
    if phone:
        body["attest_key_id"] = phone.key_id
        body["attest_assertion"] = assertion or phone.assert_(
            appattest.generate_client_data("text", text)
        )
    return client.post("/v1/generate", json=body)


def shown(client, phone=None):
    params = {"device_id": DEVICE} | ({"attest_key_id": phone.key_id} if phone else {})
    return client.get("/v1/quota", params=params).json()


def test_registering_a_key_needs_a_fresh_challenge(client, apple):
    phone = Phone(apple)
    challenge = client.post("/v1/attest/challenge").json()["challenge"]
    body = {"key_id": phone.key_id, "attestation": phone.attest(challenge), "challenge": challenge}
    assert client.post("/v1/attest/key", json=body).status_code == 200
    # The answer got lost and the app tries again: the key is kept already, so that's fine.
    assert client.post("/v1/attest/key", json=body).status_code == 200
    other = Phone(apple)
    body = {"key_id": other.key_id, "attestation": other.attest(challenge), "challenge": challenge}
    used = client.post("/v1/attest/key", json=body)  # that challenge was used
    assert used.status_code == 400 and used.json()["error"] == "attestation_failed"
    made_up = body | {"challenge": "made-up", "attestation": other.attest("made-up")}
    assert client.post("/v1/attest/key", json=made_up).status_code == 400


def test_a_key_apple_didnt_attest_isnt_kept(client, apple):
    phone = Phone(Apple())  # another "Apple"
    assert register(client, phone).status_code == 400
    assert generate(client, phone).json()["remaining"] == 40
    assert shown(client) == {"remaining": 40, "limit": 50}  # counted by the install


def test_an_attested_iphone_is_counted_by_its_key(client, apple, monkeypatch):
    monkeypatch.setattr(get_settings(), "play_integrity_credentials", '{"type": "x"}')
    monkeypatch.setattr(get_settings(), "unverified_daily_card_quota", 10)
    phone = Phone(apple)
    assert register(client, phone).status_code == 200
    assert shown(client, phone) == {"remaining": 50, "limit": 50}  # vouched for, nothing made yet
    response = generate(client, phone, cards=30)
    assert response.status_code == 200 and response.json()["remaining"] == 20
    assert shown(client, phone) == {"remaining": 20, "limit": 50}
    # The install's own allowance is untouched; without the key it's the small one.
    assert shown(client) == {"remaining": 10, "limit": 10}


def test_a_replayed_or_moved_assertion_counts_by_the_install(client, apple):
    phone = Phone(apple)
    register(client, phone)
    sent = phone.assert_(appattest.generate_client_data("text", TEXT))
    assert generate(client, phone, assertion=sent).json()["remaining"] == 40  # by the key
    assert generate(client, phone, assertion=sent).json()["remaining"] == 40  # replay: install
    assert shown(client) == {"remaining": 40, "limit": 50}
    moved = phone.assert_(appattest.generate_client_data("text", "other text"))
    generate(client, phone, assertion=moved)
    assert shown(client) == {"remaining": 30, "limit": 50}


def test_requests_without_a_key_work_as_before(client):
    response = generate(client)
    assert response.status_code == 200 and response.json()["remaining"] == 40
    assert shown(client) == {"remaining": 40, "limit": 50}


def test_odd_fields_are_refused_by_shape_or_ignored(client, apple):
    bad_key = {"device_id": DEVICE, "text": TEXT, "attest_key_id": "short"}
    assert client.post("/v1/generate", json=bad_key).status_code == 422
    unknown = Phone(apple)  # never registered
    assert generate(client, unknown).json()["remaining"] == 40


def test_nothing_about_the_key_is_logged(client, apple, caplog):
    phone = Phone(apple)
    with caplog.at_level("INFO", logger="app.appattest"):
        register(client, phone)
        generate(client, phone)
    logged = " ".join(str(r.__dict__) for r in caplog.records)
    assert phone.key_id not in logged
    ours = [r for r in caplog.records if r.name == "app.appattest"]
    assert [r.result for r in ours] == ["registered", "passed"]
