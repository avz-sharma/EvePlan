from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import settings
from app.main import app
from app.routers import auth_router
from app.services.auth_session import SESSION_COOKIE, serializer


@pytest.fixture
def auth(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_REQUIRED", True)
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "mock-client")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", SecretStr("mock-oauth-secret"))
    monkeypatch.setattr(settings, "SESSION_SECRET", SecretStr("mock-session-signing-key-32-characters"))
    monkeypatch.setattr(settings, "APP_ORIGIN", "http://testserver")
    with TestClient(app) as client:
        yield client


def test_gate_and_csrf(auth):
    assert auth.get("/api/plan/catalog").status_code == 401
    assert auth.get("/api/auth/session").json()["user"] is None
    auth.cookies.set(SESSION_COOKIE, serializer("session").dumps({"id": "user-1", "name": "Host"}))
    assert auth.get("/api/plan/catalog").status_code == 200
    assert auth.post("/api/plan/build", json={}).status_code == 403
    assert auth.post("/api/auth/logout", headers={"Origin": "https://evil.example"}).status_code == 403
    assert auth.post("/api/auth/logout", headers={"Origin": "http://testserver"}).status_code == 200


def test_oauth_round_trip(auth, monkeypatch):
    start = auth.get("/api/auth/google", follow_redirects=False)
    query = parse_qs(urlsplit(start.headers["location"]).query)
    assert query["code_challenge_method"] == ["S256"]
    assert query["redirect_uri"] == ["http://testserver/api/auth/callback"]
    assert "httponly" in start.headers["set-cookie"].lower()
    async def identity(code, verifier):
        assert code == "mock-code" and len(verifier) >= 43
        return {"id": "user-1", "name": "Host"}
    monkeypatch.setattr(auth_router, "google_identity", identity)
    callback = auth.get("/api/auth/callback", params={"code": "mock-code", "state": query["state"][0]}, follow_redirects=False)
    assert callback.headers["location"] == "http://testserver/"
    assert auth.get("/api/auth/session").json()["user"]["id"] == "user-1"
    assert "mock-code" not in callback.headers.get("set-cookie", "")
    assert auth.get("/api/plan/catalog").status_code == 200


def test_invalid_state_and_provider_failure_do_not_create_session(auth, monkeypatch):
    start = auth.get("/api/auth/google", follow_redirects=False)
    state = parse_qs(urlsplit(start.headers["location"]).query)["state"][0]
    async def failure(*args):
        raise httpx.ConnectError("provider unavailable")
    monkeypatch.setattr(auth_router, "google_identity", failure)
    assert "auth_error" in auth.get("/api/auth/callback?code=x&state=wrong", follow_redirects=False).headers["location"]
    start = auth.get("/api/auth/google", follow_redirects=False)
    state = parse_qs(urlsplit(start.headers["location"]).query)["state"][0]
    assert "auth_error" in auth.get(f"/api/auth/callback?code=x&state={state}", follow_redirects=False).headers["location"]
    assert auth.get("/api/auth/session").json()["user"] is None


def test_tampered_and_wrong_purpose_cookies_are_rejected(auth):
    for value in ["not-signed", serializer("flow").dumps({"id": "user-1"})]:
        auth.cookies.set(SESSION_COOKIE, value)
        assert auth.get("/api/plan/catalog").status_code == 401


def test_vercel_never_accepts_dev_bypass(auth, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_REQUIRED", False)
    monkeypatch.setattr(settings, "VERCEL", "1")
    assert auth.get("/api/plan/catalog").status_code == 401


def test_missing_configuration_fails_closed(auth, monkeypatch):
    monkeypatch.setattr(settings, "SESSION_SECRET", None)
    assert auth.get("/api/auth/google").status_code == 503
    assert auth.get("/api/auth/session").json()["configured"] is False


def test_google_identity_uses_server_exchange_and_verified_profile(auth, monkeypatch):
    import asyncio
    original = httpx.AsyncClient
    def handle(request):
        if request.url.path == "/token":
            assert b"code_verifier=verifier" in request.content
            return httpx.Response(200, json={"access_token": "mock-access-token"})
        assert request.headers["authorization"] == "Bearer mock-access-token"
        return httpx.Response(200, json={"sub": "subject-1", "name": "Host", "email_verified": True})
    monkeypatch.setattr(auth_router.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    assert asyncio.run(auth_router.google_identity("code", "verifier")) == {"id": "subject-1", "name": "Host"}


def test_expired_session_is_rejected(auth, monkeypatch):
    from itsdangerous import TimestampSigner
    with monkeypatch.context() as clock:
        clock.setattr(TimestampSigner, "get_timestamp", lambda self: 1)
        expired = serializer("session").dumps({"id": "user-1"})
    auth.cookies.set(SESSION_COOKIE, expired)
    assert auth.get("/api/plan/catalog").status_code == 401
