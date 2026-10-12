"""API docs (/docs, /redoc, /openapi.json), for the developer only.

- Locally: ENABLE_DOCS=true opens them.
- On Render: set ADMIN_TOKEN (render.yaml has Render generate one; read it in the service's
  Environment tab). The browser asks for a login: user "admin", password = the token. The token
  travels in the Authorization header, so it never shows up in URLs or request logs.
- With neither, the pages don't exist (404).
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.config import get_settings

_basic = HTTPBasic(auto_error=False, realm="Recap API docs")


def require_admin(
    credentials: Annotated[HTTPBasicCredentials | None, Depends(_basic)],
) -> None:
    settings = get_settings()
    if settings.enable_docs:
        return
    if not settings.admin_token:
        raise HTTPException(404, "Not Found")
    given = credentials.password.encode() if credentials else b""
    if not secrets.compare_digest(given, settings.admin_token.encode()):
        raise HTTPException(
            401,
            "Log in with user admin and your ADMIN_TOKEN.",
            headers={"WWW-Authenticate": 'Basic realm="Recap API docs"'},
        )


def add_docs(app: FastAPI) -> None:
    router = APIRouter(dependencies=[Depends(require_admin)], include_in_schema=False)

    @router.get("/openapi.json")
    def openapi() -> JSONResponse:
        return JSONResponse(app.openapi())

    @router.get("/docs")
    def swagger() -> HTMLResponse:
        return get_swagger_ui_html(openapi_url="/openapi.json", title="Recap API docs")

    @router.get("/redoc")
    def redoc() -> HTMLResponse:
        return get_redoc_html(openapi_url="/openapi.json", title="Recap API docs")

    app.include_router(router)
