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


def test_provider_credentials_failure_is_reported_without_secret_details(auth, monkeypatch, caplog):
    start = auth.get("/api/auth/google", follow_redirects=False)
    state = parse_qs(urlsplit(start.headers["location"]).query)["state"][0]
    async def rejected(*args):
        request = httpx.Request("POST", "https://oauth2.googleapis.com/token")
        response = httpx.Response(401, request=request, json={"error": "invalid_client", "error_description": "private-provider-detail"})
        raise httpx.HTTPStatusError("private-provider-detail", request=request, response=response)
    monkeypatch.setattr(auth_router, "google_identity", rejected)
    result = auth.get("/api/auth/callback", params={"state": state, "code": "mock-code"}, follow_redirects=False)
    assert "auth_error=invalid_client" in result.headers["location"]
    assert "private-provider-detail" not in caplog.text
    assert "mock-code" not in caplog.text


def test_missing_cookie_identifies_expired_browser_flow(auth):
    result = auth.get("/api/auth/callback?code=mock-code&state=mock-state", follow_redirects=False)
    assert "auth_error=session_expired" in result.headers["location"]


def test_secure_cookie_flags_on_https_for_flow_and_session(auth, monkeypatch):
    monkeypatch.setattr(settings, "APP_ORIGIN", "https://testserver")

    async def identity(code, verifier):
        return {"id": "host", "name": "Host"}

    monkeypatch.setattr(auth_router, "google_identity", identity)
    with TestClient(app, base_url="https://testserver") as client:
        start = client.get("/api/auth/google", follow_redirects=False)
        state = parse_qs(urlsplit(start.headers["location"]).query)["state"][0]
        callback = client.get("/api/auth/callback", params={"code": "test-code", "state": state}, follow_redirects=False)
    for response in [start, callback]:
        for cookie in response.headers.get_list("set-cookie"):
            assert "httponly" in cookie.lower()
            assert "secure" in cookie.lower()
            assert "samesite=lax" in cookie.lower()
    assert SESSION_COOKIE in callback.headers["set-cookie"]


def test_expired_and_tampered_flow_cookies_never_exchange_a_code(auth, monkeypatch):
    from unittest.mock import AsyncMock

    from itsdangerous import TimestampSigner

    from app.services.auth_session import FLOW_COOKIE

    identity = AsyncMock()
    monkeypatch.setattr(auth_router, "google_identity", identity)
    with monkeypatch.context() as clock:
        clock.setattr(TimestampSigner, "get_timestamp", lambda self: 1)
        expired = serializer("flow").dumps({"state": "state", "verifier": "test-verifier"})
    for value in [expired, "tampered", serializer("flow").dumps({"state": "state", "verifier": 123})]:
        auth.cookies.set(FLOW_COOKIE, value)
        result = auth.get("/api/auth/callback?code=test-code&state=state", follow_redirects=False)
        assert "auth_error=" in result.headers["location"]
    identity.assert_not_awaited()
    assert auth.get("/api/auth/session").json()["user"] is None


def test_provider_rejects_bad_pkce_without_issuing_a_session(auth, monkeypatch):
    from app.services.auth_session import FLOW_COOKIE

    original = httpx.AsyncClient

    def reject(request):
        assert b"code_verifier=incorrect-verifier" in request.content
        return httpx.Response(400, json={"error": "invalid_grant"})

    monkeypatch.setattr(auth_router.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(reject), **kwargs))
    auth.cookies.set(FLOW_COOKIE, serializer("flow").dumps({"state": "state", "verifier": "incorrect-verifier"}))
    response = auth.get("/api/auth/callback?code=test-code&state=state", follow_redirects=False)
    assert "auth_error=invalid_grant" in response.headers["location"]
    assert auth.get("/api/auth/session").json()["user"] is None


@pytest.mark.parametrize("profile", [[], {"sub": "host", "email_verified": False}, {"email_verified": True}])
def test_unverified_or_malformed_identity_is_rejected(auth, monkeypatch, profile):
    import asyncio

    original = httpx.AsyncClient

    def handle(request):
        return httpx.Response(200, json={"access_token": "test-access"} if request.url.path == "/token" else profile)

    monkeypatch.setattr(auth_router.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    with pytest.raises(ValueError):
        asyncio.run(auth_router.google_identity("test-code", "test-verifier"))
