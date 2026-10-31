"""Bounded request buffering and process-local abuse limits, with response headers."""

import time
from collections import OrderedDict, deque

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

CSP = (
    "default-src 'self'; script-src 'self' https://maps.googleapis.com https://maps.gstatic.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com; "
    "connect-src 'self' https://*.googleapis.com https://maps.gstatic.com; "
    "font-src 'self' https://fonts.gstatic.com; worker-src 'self' blob:; "
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
)
SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}


class SecurityMiddleware:
    def __init__(self, app: ASGIApp, max_body_bytes: int = 6_291_456,
                 requests_per_minute: int = 240):
        self.app = app
        self.max_body_bytes = max_body_bytes
        self.requests_per_minute = requests_per_minute
        self.clients: OrderedDict[str, deque[float]] = OrderedDict()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def secured_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.update(SECURITY_HEADERS)
            await send(message)

        if scope["path"] != "/health" and scope["method"] != "OPTIONS":
            now = time.monotonic()
            address = scope.get("client", ("unknown", 0))[0]
            recent = self.clients.setdefault(address, deque())
            self.clients.move_to_end(address)
            while recent and recent[0] <= now - 60:
                recent.popleft()
            if len(recent) >= self.requests_per_minute:
                response = JSONResponse({"detail": "Request limit reached. Please retry shortly."}, 429,
                                        headers={"Retry-After": str(max(1, int(61 - now + recent[0])))})
                await response(scope, receive, secured_send)
                return
            recent.append(now)
            if len(self.clients) > 4096:
                self.clients.popitem(last=False)

        if scope["method"] in {"POST", "PUT", "PATCH"}:
            headers = Headers(scope=scope)
            try:
                declared = int(headers.get("content-length", "0"))
            except ValueError:
                await JSONResponse({"detail": "Invalid Content-Length"}, 400)(scope, receive, secured_send)
                return
            chunks: list[bytes] = []
            size = 0
            if declared <= self.max_body_bytes:
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    data = message.get("body", b"")
                    chunks.append(data)
                    size += len(data)
                    if size > self.max_body_bytes or not message.get("more_body", False):
                        break
            if declared > self.max_body_bytes or size > self.max_body_bytes:
                await JSONResponse({"detail": "Request body is too large"}, 413)(scope, receive, secured_send)
                return
            body = b"".join(chunks)
            delivered = False

            async def replay() -> Message:
                nonlocal delivered
                if delivered:
                    return await receive()
                delivered = True
                return {"type": "http.request", "body": body, "more_body": False}

            await self.app(scope, replay, secured_send)
        else:
            await self.app(scope, receive, secured_send)
