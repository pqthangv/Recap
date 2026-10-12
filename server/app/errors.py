"""Errors the app understands: {"error": <code>, "message": <friendly text>, ...extra}."""

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, **extra: object) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra


def error_response(status: int, code: str, message: str, **extra: object) -> JSONResponse:
    return JSONResponse({"error": code, "message": message, **extra}, status_code=status)


async def api_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return error_response(exc.status, exc.code, exc.message, **exc.extra)


async def validation_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", ())[1:]) or "request"
    return error_response(
        422, "invalid_request", f"Invalid {field}: {first.get('msg', 'bad value')}"
    )
