"""Signed-session and request-origin enforcement for protected routes."""

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from ..config import settings
from ..services.auth_session import SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, read_cookie, required


class AuthenticationGate:
    """Require signed sessions and same-origin writes for protected API routes."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Reject unauthenticated requests and foreign-origin writes before route execution."""
        if (
            scope["type"] == "http"
            and scope["path"].startswith("/api/")
            and not scope["path"].startswith("/api/auth/")
            and scope["method"] != "OPTIONS"
            and required()
        ):
            request = Request(scope)
            user = read_cookie(
                request.cookies.get(SESSION_COOKIE), "session", SESSION_MAX_AGE_SECONDS
            )
            if not user or not user.get("id"):
                await JSONResponse({"detail": "Sign in to continue"}, status_code=401)(
                    scope, receive, send
                )
                return
            if (
                scope["method"] not in {"GET", "HEAD"}
                and request.headers.get("origin") != settings.APP_ORIGIN
            ):
                await JSONResponse({"detail": "Invalid request origin"}, status_code=403)(
                    scope, receive, send
                )
                return
        await self.app(scope, receive, send)
