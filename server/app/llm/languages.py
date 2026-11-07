"""The languages "Create with AI" can write each side of a card in.

Requests carry one of these codes, never a language name, so the prompt only ever contains the
names below. The app's list (CARD_LANGUAGES in app/src/lib/language.ts) must match; a test there
checks it.
"""

from typing import Literal

LanguageCode = Literal[
    "en",
    "vi",
    "zh",
    "zh-Hant",
    "yue",
    "ja",
    "ko",
    "fr",
    "de",
    "es",
    "it",
    "pt",
    "ru",
    "th",
    "hi",
    "bn",
    "id",
    "ms",
    "fil",
]

# What the AI is told (the prompt is in English). No name may contain another one (a test
# checks that only the chosen languages are named), so Cantonese is just "Cantonese": it's
# written in Traditional characters anyway.
LANGUAGE_NAMES: dict[LanguageCode, str] = {
    "en": "English",
    "vi": "Vietnamese",
    "zh": "Simplified Chinese",
    "zh-Hant": "Traditional Chinese",
    "yue": "Cantonese",
    "ja": "Japanese",
    "ko": "Korean",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "th": "Thai",
    "hi": "Hindi",
    "bn": "Bengali",
    "id": "Indonesian",
    "ms": "Malay",
    "fil": "Filipino",
}
