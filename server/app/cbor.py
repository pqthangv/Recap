"""A small reader for CBOR (RFC 8949), the binary format Apple's App Attest objects come in
(app/appattest.py). It reads only what those use, all with definite lengths: unsigned and negative
integers, byte strings, text strings, arrays and maps (text or integer keys, no repeats). Anything
else (tags, floats, true/false/null, indefinite lengths, trailing bytes, very deep nesting) is
refused, so odd data from anyone on the internet can only fail, never surprise. Whatever it reads
still has to pass Apple's signature checks."""

MAX_DEPTH = 8
MAX_ITEMS = 64


class CborError(ValueError):
    """Not CBOR, or a part of CBOR this reader doesn't take."""


def decode(data: bytes) -> object:
    """The one value `data` holds."""
    value, end = _item(data, 0, 0)
    if end != len(data):
        raise CborError("trailing bytes")
    return value


def _length(data: bytes, at: int, info: int) -> tuple[int, int]:
    """The number in an item's head (a value, a length or a count), and where the head ends."""
    if info < 24:
        return info, at
    sizes = {24: 1, 25: 2, 26: 4, 27: 8}
    if info not in sizes:  # 28–30 are reserved, 31 means an indefinite length
        raise CborError("unsupported length")
    size = sizes[info]
    if at + size > len(data):
        raise CborError("cut off")
    return int.from_bytes(data[at : at + size], "big"), at + size


def _item(data: bytes, at: int, depth: int) -> tuple[object, int]:
    if depth > MAX_DEPTH:
        raise CborError("too deep")
    if at >= len(data):
        raise CborError("cut off")
    major, info = data[at] >> 5, data[at] & 0x1F
    n, at = _length(data, at + 1, info)
    if major == 0:
        return n, at
    if major == 1:
        return -1 - n, at
    if major in (2, 3):
        if n > len(data) - at:
            raise CborError("cut off")
        raw = data[at : at + n]
        if major == 2:
            return raw, at + n
        try:
            return raw.decode("utf-8"), at + n
        except UnicodeDecodeError as e:
            raise CborError("bad text") from e
    if major == 4:
        if n > MAX_ITEMS:
            raise CborError("too many items")
        items = []
        for _ in range(n):
            value, at = _item(data, at, depth + 1)
            items.append(value)
        return items, at
    if major == 5:
        if n > MAX_ITEMS:
            raise CborError("too many items")
        result: dict[object, object] = {}
        for _ in range(n):
            key, at = _item(data, at, depth + 1)
            if not isinstance(key, (str, int)) or key in result:
                raise CborError("bad key")
            result[key], at = _item(data, at, depth + 1)
        return result, at
    raise CborError("unsupported type")  # 6: tags; 7: floats, true/false/null
