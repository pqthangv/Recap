"""The App Attest CBOR reader (app/cbor.py): the examples from RFC 8949 Appendix A for what it
takes, and refusals for everything else."""

import pytest

from app.cbor import MAX_DEPTH, MAX_ITEMS, CborError, decode


@pytest.mark.parametrize(
    ("hex_", "value"),
    [
        ("00", 0),
        ("17", 23),
        ("1818", 24),
        ("1903e8", 1000),
        ("1a000f4240", 1000000),
        ("1b000000e8d4a51000", 1000000000000),
        ("20", -1),
        ("3863", -100),
        ("40", b""),
        ("4401020304", b"\x01\x02\x03\x04"),
        ("60", ""),
        ("6449455446", "IETF"),
        ("62c3bc", "ü"),
        ("80", []),
        ("83010203", [1, 2, 3]),
        ("8301820203820405", [1, [2, 3], [4, 5]]),
        ("a0", {}),
        ("a201020304", {1: 2, 3: 4}),
        ("a26161016162820203", {"a": 1, "b": [2, 3]}),
    ],
)
def test_rfc_examples(hex_, value):
    assert decode(bytes.fromhex(hex_)) == value


@pytest.mark.parametrize(
    "hex_",
    [
        "",  # nothing
        "f5",  # true
        "f6",  # null
        "f93c00",  # a float
        "c11a514b67b0",  # a tag (a date)
        "5f42010243030405ff",  # an indefinite-length byte string
        "9fff",  # an indefinite-length array
        "1c",  # a reserved length
        "19",  # a length cut off
        "4401",  # bytes cut off
        "63616263ff",  # trailing bytes
        "62c328",  # not UTF-8
        "a2616101616102",  # a key twice
        "a1400102",  # a bytes key, and trailing bytes
        "8201",  # an array cut off
        "5b" + "ff" * 8,  # an enormous length
    ],
)
def test_refusals(hex_):
    with pytest.raises(CborError):
        decode(bytes.fromhex(hex_))


def test_deep_nesting_and_huge_containers_are_refused():
    with pytest.raises(CborError):
        decode(bytes([0x81] * (MAX_DEPTH + 2) + [0x00]))
    assert decode(bytes([0x81] * MAX_DEPTH + [0x00])) is not None
    with pytest.raises(CborError):
        decode(bytes([0x98, MAX_ITEMS + 1]) + b"\x00" * (MAX_ITEMS + 1))
