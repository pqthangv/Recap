"""Rejects request bodies that are too big, before anything reads them into memory."""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.errors import error_response


class _TooLarge(Exception):
    pass


class BodySizeLimit:
    def __init__(self, app: ASGIApp, default_limit: int, path_limits: dict[str, int]) -> None:
        self.app = app
        self.default_limit = default_limit
        self.path_limits = path_limits

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self.path_limits.get(scope["path"], self.default_limit)
        too_large = error_response(
            413, "too_large", "That's too big to send. Try something smaller."
        )

        for name, value in scope["headers"]:
            if name == b"content-length" and value.isdigit() and int(value) > limit:
                await too_large(scope, receive, send)
                return

        # No (or a wrong) Content-Length: count the bytes as they arrive.
        received = 0
        started = False

        async def counting_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _TooLarge
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, counting_receive, tracking_send)
        except _TooLarge:
            if not started:
                await too_large(scope, receive, send)
