"""Turning whatever the model returned into cards we're willing to show."""

import re

from app.llm.base import Card

MAX_FRONT_CHARS = 500
MAX_BACK_CHARS = 2_000


def _text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    # Models sometimes number cards or add markdown bold; neither belongs on a card.
    value = re.sub(r"^\s*(?:\d+[.)]|[-*•])\s+", "", value)
    value = value.replace("**", "")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in value.strip().splitlines()]
    return "\n".join(line for line in lines if line)


def _key(front: str) -> str:
    return re.sub(r"\W+", " ", front.casefold()).strip()


def clean_cards(raw: list[object], max_cards: int) -> list[Card]:
    """Keeps well-formed cards: both sides present, sane length, no repeated fronts, at most
    `max_cards`. Malformed items are dropped one by one, so one bad card doesn't sink the rest."""
    cards: list[Card] = []
    seen: set[str] = set()
    for item in raw:
        if len(cards) >= max_cards:
            break
        if not isinstance(item, dict):
            continue
        front, back = _text(item.get("front")), _text(item.get("back"))
        if not front or not back or len(front) > MAX_FRONT_CHARS or len(back) > MAX_BACK_CHARS:
            continue
        key = _key(front)
        if not key or key in seen:
            continue
        seen.add(key)
        cards.append(Card(front=front, back=back))
    return cards
