"""Recap's server: AI card generation, quotas, AI card reports, and (later) share links and sync.

Run locally:  uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse
from starlette.formparsers import MultiPartParser

from app.admin import router as admin_router
from app.api import router
from app.config import get_settings
from app.docs import add_docs
from app.errors import ApiError, api_error_handler, validation_error_handler
from app.limits import BodySizeLimit
from app.logs import setup_logging

settings = get_settings()
setup_logging(settings.log_level)

# Keep uploaded PDFs in memory instead of spilling them to a temporary file: Render's disk is
# ephemeral and nothing is stored. BodySizeLimit caps the upload size first.
MultiPartParser.spool_max_size = settings.max_pdf_bytes + 1

# FastAPI's public docs are off; app/docs.py serves them behind ADMIN_TOKEN instead.
app = FastAPI(title="Recap API", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)
app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_middleware(
    BodySizeLimit,
    default_limit=settings.max_json_bytes,
    # Room for the multipart wrapping around the file.
    path_limits={"/v1/extract-pdf": settings.max_pdf_bytes + 64 * 1024},
)
app.include_router(router)
app.include_router(admin_router)
add_docs(app)


@app.get("/health")
def health() -> dict[str, bool]:
    """For uptime pings and Render's health check. Never touches the database, so pings can't
    keep Neon awake."""
    return {"ok": True}


PRIVACY_POLICY = (Path(__file__).parent / "privacy.html").read_text(encoding="utf-8")
SUPPORT_PAGE = (Path(__file__).parent / "support.html").read_text(encoding="utf-8")


@app.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
def privacy() -> str:
    """The privacy policy (Google Play needs a public URL; the website will host it later)."""
    return PRIVACY_POLICY


@app.get("/support", response_class=HTMLResponse, include_in_schema=False)
def support() -> str:
    """Help and contact page (the App Store needs a support URL)."""
    return SUPPORT_PAGE
