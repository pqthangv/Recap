"""What every card generator (Gemini, the fake, a future provider) looks like."""

from dataclasses import dataclass
from typing import Literal, Protocol

from pydantic import BaseModel

from app.llm.languages import LanguageCode

Mode = Literal["text", "topic"]


@dataclass(frozen=True)
class GenerationRequest:
    # Study material (mode "text") or a short topic (mode "topic").
    text: str
    mode: Mode
    max_cards: int
    # The language of each side of the cards; None = the source's language.
    front_language: LanguageCode | None = None
    back_language: LanguageCode | None = None
    # The app can draw LaTeX between $…$ (1.0.6+). Older apps show it as typed, so for them the
    # AI is asked for plain characters instead.
    math: bool = False


class Card(BaseModel):
    front: str
    back: str


class CardList(BaseModel):
    """The JSON shape asked of the model: an object, not a bare list."""

    cards: list[Card]


class ProviderBusy(Exception):
    """Rate limited or overloaded, even after retrying. Tell the user to try again later."""


class ProviderBlocked(Exception):
    """The AI refused this text (Google's built-in protections). Trying again won't help, so it
    isn't retried on another model: tell the user to try different text."""


class ProviderFailed(Exception):
    """Any other failure (bad key, unreadable answer)."""


class CardProvider(Protocol):
    def generate(self, request: GenerationRequest) -> list[object]:
        """Raw items of the model's "cards" array. clean_cards() decides which are usable."""
        ...
