"""The languages "Create with AI" can write each side of a card in.

Requests carry one of these codes, never a language name, so the prompt only ever contains the
names below. The app's list (app/src/lib/ai.ts) must match; a test checks it.
"""

from typing import Literal

LanguageCode = Literal["en", "vi", "zh", "ja", "ko", "fr", "de", "es", "it", "pt", "ru", "th"]

# What the AI is told (the prompt is in English).
LANGUAGE_NAMES: dict[LanguageCode, str] = {
    "en": "English",
    "vi": "Vietnamese",
    "zh": "Simplified Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "th": "Thai",
}
