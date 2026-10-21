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


# A LaTeX command whose backslash the model didn't escape in its JSON reaches us as a control
# character: "\frac" as a form feed + "rac", "\times" as a tab + "imes". These never belong on a
# card, so they're put back. (A newline is only put back where it can't be a real one: inside a
# formula, before the rest of a command, e.g. "\neq".)
_CONTROL = {"\f": "\\f", "\b": "\\b", "\v": "\\v", "\a": "\\a"}
_TAB_OR_CR = re.compile(r"[\t\r](?=[a-zA-Z])")
_NEWLINE_COMMAND = re.compile(r"\n(?=(?:eq|abla|ot|eg|u|i|e|ewline|otin|exists|leq|geq)\b)")


def _repair_latex(value: str) -> str:
    for char, command in _CONTROL.items():
        value = value.replace(char, command)
    value = _TAB_OR_CR.sub(lambda m: "\\t" if m.group() == "\t" else "\\r", value)

    def in_formula(match: re.Match[str]) -> str:
        line = value[: match.start()].rsplit("\n", 1)[-1]
        return "\\n" if line.replace("\\$", "").count("$") % 2 == 1 else match.group()

    return _NEWLINE_COMMAND.sub(in_formula, value)


# The app draws math between $…$ and $$…$$; models also use \(…\) and \[…\].
_INLINE = re.compile(r"\\\((.+?)\\\)", re.DOTALL)
_DISPLAY = re.compile(r"\\\[(.+?)\\\]", re.DOTALL)


def _math_text(value: object) -> object:
    if not isinstance(value, str):
        return value
    value = _repair_latex(value)
    value = _DISPLAY.sub(lambda m: f"$${m.group(1).strip()}$$", value)
    return _INLINE.sub(lambda m: f"${m.group(1).strip()}$", value)


def clean_cards(raw: list[object], max_cards: int, math: bool = False) -> list[Card]:
    """Keeps well-formed cards: both sides present, sane length, no repeated fronts, at most
    `max_cards`. Malformed items are dropped one by one, so one bad card doesn't sink the rest.
    `math`: the app draws LaTeX, so it's repaired and put between $ signs."""
    cards: list[Card] = []
    seen: set[str] = set()
    for item in raw:
        if len(cards) >= max_cards:
            break
        if not isinstance(item, dict):
            continue
        front, back = item.get("front"), item.get("back")
        if math:
            front, back = _math_text(front), _math_text(back)
        front, back = _text(front), _text(back)
        if not front or not back or len(front) > MAX_FRONT_CHARS or len(back) > MAX_BACK_CHARS:
            continue
        key = _key(front)
        if not key or key in seen:
            continue
        seen.add(key)
        cards.append(Card(front=front, back=back))
    return cards
