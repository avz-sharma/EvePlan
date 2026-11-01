import re

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.main import app
from app.middleware.security import SecurityMiddleware


def protected_app(limit=1024, rpm=100):
    app = FastAPI()
    app.add_middleware(SecurityMiddleware, max_body_bytes=limit, requests_per_minute=rpm)

    @app.post("/echo")
    async def echo(request: Request):
        return {"length": len(await request.body())}

    return app


def test_headers_and_body_limit_apply_before_endpoint_execution():
    with TestClient(protected_app(limit=10)) as client:
        response = client.post("/echo", content=b"small")
        assert response.status_code == 200
        assert response.headers["x-content-type-options"] == "nosniff"
        csp = response.headers["content-security-policy"]
        assert "script-src 'self'" in csp
        assert "'unsafe-inline'" not in csp.split("script-src ")[1].split(";")[0]
        assert client.post("/echo", content=b"x" * 11).status_code == 413


def test_actual_streamed_body_limit_and_request_rate_limit():
    with TestClient(protected_app(limit=10, rpm=2)) as client:
        assert client.post("/echo", content=iter([b"123456", b"789012"])).status_code == 413
        assert client.post("/echo", content=b"ok").status_code == 200
        response = client.post("/echo", content=b"ok")
        assert response.status_code == 429
        assert int(response.headers["retry-after"]) > 0


def test_exact_cors_compression_and_documentation_scripts():
    with pytest.raises(ValidationError):
        Settings(ALLOWED_ORIGINS=["*"])
    with TestClient(app) as client:
        allowed = client.options("/api/vendors/search", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
        assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
        denied = client.options("/api/vendors/search", headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST"})
        assert "access-control-allow-origin" not in denied.headers
        assert client.get("/api/plan/catalog", headers={"Accept-Encoding": "gzip"}).headers["content-encoding"] == "gzip"
        for path in ["/docs", "/redoc"]:
            response = client.get(path)
            assert response.status_code == 200
            assert not re.search(r"<script(?:\s[^>]*)?>(?!\s*</script>)[\s\S]*?</script>", response.text)
        assert client.get("/static/docs/swagger-init.js").status_code == 200


def test_invalid_length_and_rate_window_recovery(monkeypatch):
    from types import SimpleNamespace

    from app.middleware import security

    clock = [100.0]
    monkeypatch.setattr(security, "time", SimpleNamespace(monotonic=lambda: clock[0]))
    with TestClient(protected_app(limit=10, rpm=2)) as client:
        invalid = client.post("/echo", content=b"x", headers={"Content-Length": "invalid"})
        assert invalid.status_code == 400
        assert client.post("/echo", content=b"ok").status_code == 200
        limited = client.post("/echo", content=b"ok")
        assert limited.status_code == 429 and "retry-after" in limited.headers
        assert limited.headers["x-content-type-options"] == "nosniff"
        clock[0] += 61
        assert client.post("/echo", content=b"ok").status_code == 200
