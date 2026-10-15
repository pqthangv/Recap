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


class Card(BaseModel):
    front: str
    back: str


class CardList(BaseModel):
    """The JSON shape asked of the model: an object, not a bare list."""

    cards: list[Card]


class ProviderBusy(Exception):
    """Rate limited or overloaded, even after retrying. Tell the user to try again later."""


class ProviderFailed(Exception):
    """Any other failure (bad key, blocked content, unreadable answer)."""


class CardProvider(Protocol):
    def generate(self, request: GenerationRequest) -> list[object]:
        """Raw items of the model's "cards" array. clean_cards() decides which are usable."""
        ...
