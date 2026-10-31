"""Signed, purpose-bound expiring cookies; Google access tokens are never persisted."""
from typing import Any

from itsdangerous import BadSignature, URLSafeTimedSerializer

from ..config import settings

SESSION_COOKIE = "eveplan_session"
FLOW_COOKIE = "eveplan_oauth"


def required() -> bool:
    return bool(settings.VERCEL) or settings.AUTH_REQUIRED


def configured() -> bool:
    return bool(settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET
                and settings.SESSION_SECRET and len(settings.SESSION_SECRET.get_secret_value()) >= 32)


def serializer(purpose: str) -> URLSafeTimedSerializer:
    if not settings.SESSION_SECRET or len(settings.SESSION_SECRET.get_secret_value()) < 32:
        raise ValueError("Authentication is not configured")
    return URLSafeTimedSerializer(settings.SESSION_SECRET.get_secret_value(), salt=f"eveplan-{purpose}-v1")


def read_cookie(value: str | None, purpose: str, max_age: int) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        data = serializer(purpose).loads(value, max_age=max_age)
        return data if isinstance(data, dict) else None
    except (BadSignature, ValueError):
        return None
