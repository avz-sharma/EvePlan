from fastapi.testclient import TestClient
from pydantic import SecretStr
from starlette.requests import Request

from app.config import settings
from app.main import app
from app.routers.vendor_search_router import _service


def test_places_provider_reuses_and_closes_app_client(monkeypatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_PLACES_API_KEY", SecretStr("mock-provider-key"))
    with TestClient(app):
        client = app.state.places_client
        request = Request({"type": "http", "app": app})
        assert _service(request).provider.client is client
        assert _service(request).provider.client is client
        assert not client.is_closed
    assert client.is_closed
