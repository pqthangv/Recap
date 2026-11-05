"""Apple App Attest (roadmap 6.0, 1.0.8): proof that an AI request comes from the real Recap app
on a real iPhone, the iPhone's version of Play Integrity (app/integrity.py). Then the day's AI
cards are counted by the phone's key, which a script can't make up: every key needs Apple to
vouch for it. Apple doesn't keep the key over a reinstall, so a reinstall gets a new one.

Two steps, as in Apple's "Validating apps that connect to your server":
1. Registering, once per install: the app makes a key, gets a one-time challenge from
   /v1/attest/challenge, and Apple attests the key for it. /v1/attest/key checks that
   attestation and keeps the key's public half.
2. Every "Make cards": the app signs the request with the key (an assertion), and /v1/generate
   checks the signature, and that the key's counter went up (so an old one can't be sent again).

Nothing here ever blocks a request: no assertion, one that fails, or a key we don't know all mean
the install id's allowance, as before. Key ids, attestations and assertions are never logged.
"""

import base64
import hashlib
import logging
import secrets
import threading
import time
from collections import OrderedDict
from datetime import UTC, datetime
from uuid import UUID, uuid5

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import Engine, select, update

from app.cbor import CborError, decode
from app.config import Settings
from app.models import AppAttestKey
from app.quota import _insert

log = logging.getLogger(__name__)

# Fixed forever: a new value would give every iPhone a fresh counter.
KEY_NAMESPACE = UUID("4f2b7c1e-6a3d-4e8f-9b05-2d7e1c9a6f43")
# Apple's App Attestation Root CA, public:
# https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
APPLE_ROOT_PEM = b"""-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----
"""
# The certificate extension holding the nonce Apple attested.
NONCE_OID = x509.ObjectIdentifier("1.2.840.113635.100.8.2")
# What Apple puts in authData's aaguid: keys from the production App Attest service, and from the
# development one (debug builds; only taken when APP_ATTEST_DEVELOPMENT is on).
AAGUID_PRODUCTION = b"appattest" + b"\x00" * 7
AAGUID_DEVELOPMENT = b"appattestdevelop"
# Real attestations are ~5 KB and assertions ~200 bytes (base64); anything far longer isn't read.
MAX_ATTESTATION_CHARS = 16_000
MAX_ASSERTION_CHARS = 2_000
CHALLENGE_TTL_S = 5 * 60
MAX_CHALLENGES = 10_000


class Challenges:
    """One-time challenges for registering a key, kept in memory for 5 minutes on the one free
    Render instance (like app/abuse.py's limits): a restart forgets them, and the app asks again."""

    def __init__(self, clock=time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._issued: OrderedDict[str, float] = OrderedDict()

    def issue(self) -> str:
        challenge = secrets.token_urlsafe(32)
        with self._lock:
            self._drop_old()
            self._issued[challenge] = self._clock()
            while len(self._issued) > MAX_CHALLENGES:
                self._issued.popitem(last=False)
        return challenge

    def take(self, challenge: str) -> bool:
        """True once for a challenge issued in the last 5 minutes."""
        with self._lock:
            self._drop_old()
            return self._issued.pop(challenge, None) is not None

    def reset(self) -> None:
        with self._lock:
            self._issued.clear()

    def _drop_old(self) -> None:
        oldest = self._clock() - CHALLENGE_TTL_S
        while self._issued and next(iter(self._issued.values())) < oldest:
            self._issued.popitem(last=False)


challenges = Challenges()


def trusted_id(key_id: str) -> str:
    """The phone's quota id. A version-5 UUID, so it fits the devices table and can never be an
    install id (version 4) or an Android phone's (another namespace)."""
    return str(uuid5(KEY_NAMESPACE, key_id))


def _sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def _b64(text: str, limit: int) -> bytes | None:
    if not text or len(text) > limit:
        return None
    try:
        return base64.b64decode(text, validate=True)
    except ValueError:
        return None


def _root() -> x509.Certificate:
    return x509.load_pem_x509_certificate(APPLE_ROOT_PEM)


def _valid_now(cert: x509.Certificate, now: datetime) -> bool:
    return cert.not_valid_before_utc <= now <= cert.not_valid_after_utc


def verify_attestation(
    key_id: str,
    attestation: str,
    challenge: str,
    app_id: str,
    *,
    development: bool = False,
    root: x509.Certificate | None = None,
    now: datetime | None = None,
) -> bytes | str:
    """The key's public half (an uncompressed P-256 point) when Apple attested it for this app and
    challenge; else "failed:<why>"."""
    now = now or datetime.now(UTC)
    key = _b64(key_id, 100)
    raw = _b64(attestation, MAX_ATTESTATION_CHARS)
    if key is None or len(key) != 32 or raw is None:
        return "failed:format"
    try:
        obj = decode(raw)
    except CborError:
        return "failed:format"
    if not isinstance(obj, dict) or obj.get("fmt") != "apple-appattest":
        return "failed:format"
    statement, auth_data = obj.get("attStmt"), obj.get("authData")
    chain = statement.get("x5c") if isinstance(statement, dict) else None
    if (
        not isinstance(auth_data, bytes)
        or not isinstance(chain, list)
        or len(chain) != 2
        or not all(isinstance(c, bytes) for c in chain)
    ):
        return "failed:format"

    # 1. The key's certificate, signed by Apple's intermediate, signed by Apple's root.
    try:
        leaf, intermediate = (x509.load_der_x509_certificate(c) for c in chain)
        intermediate.verify_directly_issued_by(root or _root())
        leaf.verify_directly_issued_by(intermediate)
    except (ValueError, TypeError, InvalidSignature):
        return "failed:chain"
    if not (_valid_now(leaf, now) and _valid_now(intermediate, now)):
        return "failed:chain"

    # 2. Apple attested this challenge with this authData: the nonce in the certificate.
    nonce = _sha256(auth_data + _sha256(challenge.encode()))
    try:
        extension = leaf.extensions.get_extension_for_oid(NONCE_OID).value
    except x509.ExtensionNotFound:
        return "failed:nonce"
    # DER: SEQUENCE { [1] { OCTET STRING (32 bytes) } }
    if getattr(extension, "value", None) != bytes([0x30, 0x24, 0xA1, 0x22, 0x04, 0x20]) + nonce:
        return "failed:nonce"

    # 3. The certificate is for this key: the key id is the SHA-256 of its public half.
    public_key = leaf.public_key()
    if not isinstance(public_key, ec.EllipticCurvePublicKey) or not isinstance(
        public_key.curve, ec.SECP256R1
    ):
        return "failed:key"
    point = public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    if _sha256(point) != key:
        return "failed:key"

    # 4. authData: for Recap, a new key (counter 0), from Apple's service, with the same id.
    if len(auth_data) < 55 or auth_data[:32] != _sha256(app_id.encode()):
        return "failed:app"
    if int.from_bytes(auth_data[33:37], "big") != 0:
        return "failed:counter"
    aaguid = auth_data[37:53]
    if aaguid != AAGUID_PRODUCTION and not (development and aaguid == AAGUID_DEVELOPMENT):
        return "failed:environment"
    length = int.from_bytes(auth_data[53:55], "big")
    if auth_data[55 : 55 + length] != key:
        return "failed:key"
    return point


def verify_assertion(
    assertion: str, client_data: str, point: bytes, counter: int, app_id: str
) -> int | str:
    """The key's new counter when `assertion` signs `client_data` for this app and its counter went
    up; else "failed:<why>"."""
    raw = _b64(assertion, MAX_ASSERTION_CHARS)
    if raw is None:
        return "failed:format"
    try:
        obj = decode(raw)
    except CborError:
        return "failed:format"
    signature = obj.get("signature") if isinstance(obj, dict) else None
    auth_data = obj.get("authenticatorData") if isinstance(obj, dict) else None
    if not isinstance(signature, bytes) or not isinstance(auth_data, bytes) or len(auth_data) < 37:
        return "failed:format"
    nonce = _sha256(auth_data + _sha256(client_data.encode()))
    try:
        public_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), point)
        public_key.verify(signature, nonce, ec.ECDSA(hashes.SHA256()))
    except (ValueError, InvalidSignature):
        return "failed:signature"
    if auth_data[:32] != _sha256(app_id.encode()):
        return "failed:app"
    new_counter = int.from_bytes(auth_data[33:37], "big")
    if new_counter <= counter:
        return "failed:counter"
    return new_counter


def generate_client_data(mode: str, text: str) -> str:
    """What the app signs for a "Make cards" request: the request itself, so an assertion can't
    be moved to another one. The app builds the same text (src/lib/ai.ts)."""
    return f"recap-generate\n{mode}\n{text}"


def register(
    engine: Engine, key_id: str, attestation: str, challenge: str, settings: Settings
) -> bool:
    """Checks a new key's attestation and keeps the key. A challenge works once; a key that's
    already kept is fine (the app tries again when an answer got lost)."""
    if known(engine, key_id):
        log.info("app attest", extra={"result": "already"})
        return True
    if not challenges.take(challenge):
        log.info("app attest", extra={"result": "failed:challenge"})
        return False
    try:
        result = verify_attestation(
            key_id,
            attestation,
            challenge,
            settings.apple_app_id,
            development=settings.app_attest_development,
        )
    except Exception as e:  # an odd certificate or a bug: never the user's problem
        log.error("app attest", extra={"result": "error", "reason": type(e).__name__})
        return False
    if isinstance(result, str):
        log.info("app attest", extra={"result": result})
        return False
    with engine.begin() as conn:
        conn.execute(
            _insert(conn.engine)(AppAttestKey)
            .values(key_id=key_id, public_key=result, counter=0)
            .on_conflict_do_nothing()
        )
    log.info("app attest", extra={"result": "registered"})
    return True


def known(engine: Engine, key_id: str) -> bool:
    """Whether Apple vouched for this key here before."""
    with engine.connect() as conn:
        found = conn.execute(select(AppAttestKey.key_id).where(AppAttestKey.key_id == key_id))
        return found.first() is not None


def check(
    engine: Engine,
    key_id: str | None,
    assertion: str | None,
    client_data: str,
    settings: Settings,
) -> str | None:
    """The phone's trusted id when its assertion passes; None means "count by the install id"."""
    if not key_id or not assertion:
        return None
    try:
        with engine.connect() as conn:
            row = conn.execute(
                select(AppAttestKey.public_key, AppAttestKey.counter).where(
                    AppAttestKey.key_id == key_id
                )
            ).first()
        if row is None:
            log.info("app attest", extra={"result": "failed:unknown-key"})
            return None
        result = verify_assertion(
            assertion, client_data, row.public_key, row.counter, settings.apple_app_id
        )
        if isinstance(result, str):
            log.info("app attest", extra={"result": result})
            return None
        # Only if no other request moved the counter on meanwhile: each assertion works once.
        with engine.begin() as conn:
            moved = conn.execute(
                update(AppAttestKey)
                .where(AppAttestKey.key_id == key_id, AppAttestKey.counter < result)
                .values(counter=result, used_at=datetime.now(UTC))
            ).rowcount
    except Exception as e:  # the database or a bug: never the user's problem
        log.error("app attest", extra={"result": "error", "reason": type(e).__name__})
        return None
    if not moved:
        log.info("app attest", extra={"result": "failed:counter"})
        return None
    log.info("app attest", extra={"result": "passed"})
    return trusted_id(key_id)
