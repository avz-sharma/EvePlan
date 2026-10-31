import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def local_test_auth_mode(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_REQUIRED", False)
    monkeypatch.setattr(settings, "VERCEL", "")
