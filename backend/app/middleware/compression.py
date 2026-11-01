"""Compress ordinary responses while preserving incremental SSE delivery."""

from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send


class CompressionMiddleware:
    """Compress JSON while ensuring the incremental SSE response is never buffered."""

    def __init__(self, app: ASGIApp):
        self.app = app
        self.compressed = GZipMiddleware(app, minimum_size=1000, compresslevel=5)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Bypass compression for streams so event chunks reach the client immediately."""
        target = self.app if scope.get("path", "").endswith("/stream") else self.compressed
        await target(scope, receive, send)
