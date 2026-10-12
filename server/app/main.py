"""Recap's server: AI card generation, quotas, and (later) share links and sync.

Run locally:  uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"""

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.formparsers import MultiPartParser

from app.api import router
from app.config import get_settings
from app.errors import ApiError, api_error_handler, validation_error_handler
from app.limits import BodySizeLimit
from app.logs import setup_logging

settings = get_settings()
setup_logging(settings.log_level)

# Keep uploaded PDFs in memory instead of spilling them to a temporary file: Render's disk is
# ephemeral and nothing is stored. BodySizeLimit caps the upload size first.
MultiPartParser.spool_max_size = settings.max_pdf_bytes + 1

# No public API docs in production (ENABLE_DOCS=true turns them on locally).
docs = settings.enable_docs
app = FastAPI(
    title="Recap API",
    version="1.0.0",
    docs_url="/docs" if docs else None,
    redoc_url="/redoc" if docs else None,
    openapi_url="/openapi.json" if docs else None,
)
app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_middleware(
    BodySizeLimit,
    default_limit=settings.max_json_bytes,
    # Room for the multipart wrapping around the file.
    path_limits={"/v1/extract-pdf": settings.max_pdf_bytes + 64 * 1024},
)
app.include_router(router)


@app.get("/health")
def health() -> dict[str, bool]:
    """For uptime pings and Render's health check. Never touches the database, so pings can't
    keep Neon awake."""
    return {"ok": True}
