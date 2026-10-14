"""Recap's server: AI card generation, quotas, AI card reports, and (later) share links and sync.

Run locally:  uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"""

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
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
# Added last, so it runs first: the browser's preflight check (OPTIONS) is answered here, before
# the size limit or the rate limit see it. Only the web version's own pages may call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.web_origins.split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    max_age=600,
)
app.include_router(router)
app.include_router(admin_router)
add_docs(app)


@app.get("/health")
def health() -> dict[str, bool]:
    """For uptime pings and Render's health check. Never touches the database, so pings can't
    keep Neon awake."""
    return {"ok": True}


# The privacy policy and help page live on the website (site/ in the repo, on Cloudflare Pages).
# The server used to serve them, and app versions up to 1.0.3 still link here, so these stay as
# permanent redirects.
SITE_URL = "https://recapflashcards.com"


@app.get("/privacy", include_in_schema=False)
def privacy() -> RedirectResponse:
    return RedirectResponse(f"{SITE_URL}/privacy", status_code=301)


@app.get("/support", include_in_schema=False)
def support() -> RedirectResponse:
    return RedirectResponse(f"{SITE_URL}/support", status_code=301)
