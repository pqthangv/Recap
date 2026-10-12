"""A stand-in for Gemini: makes predictable cards from the text, no network, no key.

Used by the tests and for local development (LLM_PROVIDER=fake). Put "[fake:busy]" or
"[fake:garbage]" in the text to try the app's error handling.
"""

import re

from app.llm.base import GenerationRequest, ProviderBusy


class FakeProvider:
    def generate(self, request: GenerationRequest) -> list[object]:
        if "[fake:busy]" in request.text:
            raise ProviderBusy("fake provider: busy")
        if "[fake:garbage]" in request.text:
            return ["not a card", {"front": ""}, {"back": "no front"}, 42]
        if request.mode == "topic":
            return [
                {"front": f"{request.text}: question {i}?", "back": f"Answer {i}"}
                for i in range(1, request.max_cards + 1)
            ]
        cards: list[object] = []
        for line in re.split(r"\n+|(?<=[.!?])\s+", request.text):
            line = line.strip()
            if not line:
                continue
            parts = re.split(r"\s+[-–—]\s+|:\s+", line, maxsplit=1)
            if len(parts) == 2 and parts[0] and parts[1]:
                cards.append({"front": parts[0], "back": parts[1]})
            else:
                words = line.rstrip(".!?").split()
                cards.append({"front": f"Complete: {' '.join(words[:-1])} …", "back": line})
            if len(cards) >= request.max_cards:
                break
        return cards
