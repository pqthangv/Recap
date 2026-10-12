"""Text from a PDF, entirely in memory (Render's disk is temporary; nothing is saved)."""

import io
import logging
import re
from dataclasses import dataclass

from pypdf import PageObject, PdfReader
from pypdf.errors import PdfReadError

from app.errors import ApiError

log = logging.getLogger(__name__)

# Enough for a chapter of notes, and bounds the CPU a single request can use.
MAX_PAGES = 300


@dataclass(frozen=True)
class PdfText:
    text: str
    pages: int
    truncated: bool


def tidy(text: str) -> str:
    """Spaces collapsed within lines, at most one blank line in a row."""
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def looks_scattered(text: str) -> bool:
    """pypdf's default reading puts every word on its own line for some exported PDFs (seen with
    a real exam: "Wednesday,\\n \\nOctober\\n \\n14,"). Its layout mode reads those properly."""
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 20:
        return False
    return sum(len(line.split()) for line in lines) / len(lines) < 1.5


def page_text(page: PageObject) -> str:
    # The default mode keeps side-by-side columns apart, so it's the first choice.
    text = page.extract_text() or ""
    if looks_scattered(text):
        try:
            layout = page.extract_text(extraction_mode="layout") or ""
        except Exception:  # layout mode is stricter; keep the default text if it fails
            layout = ""
        if layout.strip():
            text = layout
    return tidy(text)


def extract_text(data: bytes, max_chars: int) -> PdfText:
    if not data.startswith(b"%PDF"):
        raise ApiError(422, "bad_pdf", "That file isn't a PDF.")
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise ApiError(
                422,
                "pdf_locked",
                "This PDF is password-protected. Remove the password and try again.",
            )
        parts: list[str] = []
        length = 0
        pages = len(reader.pages)
        for page in reader.pages[:MAX_PAGES]:
            text = page_text(page)
            if text:
                parts.append(text)
                length += len(text) + 2
            if length > max_chars:
                break
    except ApiError:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError) as e:
        log.info("pdf unreadable", extra={"bytes": len(data), "reason": type(e).__name__})
        raise ApiError(422, "bad_pdf", "Recap couldn't read this PDF. It may be damaged.") from e

    text = "\n\n".join(parts).strip()
    if not text:
        raise ApiError(
            422,
            "pdf_no_text",
            "This PDF has no text Recap can read (it may be scanned). Take a photo of it instead.",
        )
    truncated = len(text) > max_chars or pages > MAX_PAGES
    return PdfText(text=text[:max_chars].rstrip(), pages=pages, truncated=truncated)
