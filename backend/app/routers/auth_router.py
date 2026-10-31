import hashlib
import logging
import secrets
from base64 import urlsafe_b64encode
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from starlette.responses import JSONResponse, RedirectResponse, Response

from ..config import settings
from ..services.auth_session import (
    FLOW_COOKIE,
    SESSION_COOKIE,
    configured,
    read_cookie,
    required,
    serializer,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def cookie(response: Response, name: str, value: str, max_age: int) -> None:
    response.set_cookie(name, value, max_age=max_age, httponly=True, secure=settings.APP_ORIGIN.startswith("https://"), samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"


@router.get("/session")
async def session(request: Request) -> Response:
    user = read_cookie(request.cookies.get(SESSION_COOKIE), "session", 28800)
    return JSONResponse({"required": required(), "configured": configured(), "user": user}, headers={"Cache-Control": "no-store"})


@router.get("/google")
async def login() -> Response:
    if not configured():
        raise HTTPException(503, "Google sign-in has not been configured by the site owner")
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(64)
    challenge = urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    query = urlencode({"client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": settings.APP_ORIGIN + "/api/auth/callback", "response_type": "code",
        "scope": "openid email profile", "state": state, "code_challenge": challenge,
        "code_challenge_method": "S256", "prompt": "select_account"})
    response = RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + query, status_code=302)
    cookie(response, FLOW_COOKIE, serializer("flow").dumps({"state": state, "verifier": verifier}), 600)
    return response


async def google_identity(code: str, verifier: str) -> dict[str, Any]:
    assert settings.GOOGLE_OAUTH_CLIENT_SECRET is not None
    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
        token = await client.post("https://oauth2.googleapis.com/token", data={
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET.get_secret_value(),
            "code": code, "code_verifier": verifier, "grant_type": "authorization_code",
            "redirect_uri": settings.APP_ORIGIN + "/api/auth/callback"})
        token.raise_for_status()
        access = token.json()["access_token"]
        profile = await client.get("https://openidconnect.googleapis.com/v1/userinfo", headers={"Authorization": f"Bearer {access}"})
        profile.raise_for_status()
        data: dict[str, Any] = profile.json()
        if not isinstance(data.get("sub"), str) or not data["sub"] or data.get("email_verified") is not True:
            raise ValueError("Google identity is not verified")
        return {"id": data["sub"], "name": str(data.get("name", "Guest"))[:120]}


@router.get("/callback")
async def callback(request: Request, code: str = "", state: str = "", error: str = "") -> Response:
    flow = read_cookie(request.cookies.get(FLOW_COOKIE), "flow", 600)
    reason = "cancelled" if error == "access_denied" else "session_expired" if not flow else "state_mismatch"
    response = RedirectResponse(settings.APP_ORIGIN + "/?auth_error=" + reason, status_code=303)
    if configured() and not error and code and len(code) <= 4096 and flow and secrets.compare_digest(str(flow.get("state", "")), state) and state:
        try:
            user = await google_identity(code, flow["verifier"])
            response = RedirectResponse(settings.APP_ORIGIN + "/", status_code=303)
            cookie(response, SESSION_COOKIE, serializer("session").dumps(user), 28800)
        except (httpx.HTTPError, ValueError, KeyError) as failure:
            reason = "provider_unavailable"
            if isinstance(failure, httpx.HTTPStatusError):
                reason = "provider_rejected"
                try:
                    provider_error = failure.response.json().get("error")
                    if provider_error in {"invalid_client", "invalid_grant", "unauthorized_client"}:
                        reason = provider_error
                except (ValueError, AttributeError, TypeError):
                    pass
            logging.getLogger(__name__).warning("OAuth callback failed: %s", reason)
            response = RedirectResponse(settings.APP_ORIGIN + "/?auth_error=" + reason, status_code=303)
    if "auth_error=" in response.headers["location"]:
        logging.getLogger(__name__).warning("OAuth callback declined: %s", reason)
    response.delete_cookie(FLOW_COOKIE, path="/", secure=settings.APP_ORIGIN.startswith("https://"), httponly=True, samesite="lax")
    response.headers["Cache-Control"] = "no-store"
    return response


@router.post("/logout")
async def logout(request: Request) -> Response:
    if request.headers.get("origin") != settings.APP_ORIGIN:
        raise HTTPException(403, "Invalid request origin")
    response = JSONResponse({"ok": True}, headers={"Cache-Control": "no-store"})
    response.delete_cookie(SESSION_COOKIE, path="/", secure=settings.APP_ORIGIN.startswith("https://"), httponly=True, samesite="lax")
    return response
