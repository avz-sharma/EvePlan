import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.vendor_search import maps_search_url


def test_free_search_never_calls_a_provider(monkeypatch):
    import httpx
    def forbidden(*args, **kwargs):
        raise AssertionError("Network forbidden")
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", forbidden)
    with TestClient(app) as client:
        assert client.post("/api/vendors/search", json={"category": "venue", "city": "Pune"}).status_code == 200
    assert "api=1" in maps_search_url("photographers", "Amritsar")


@pytest.mark.parametrize("body", [{"category": "venue"}, {"category": "venue", "city": " "}, {"category": "unknown", "city": "Pune"}, {"category": "venue", "city": "x" * 121}])
def test_search_validation(body):
    with TestClient(app) as client:
        assert client.post("/api/vendors/search", json=body).status_code == 422


def test_search_returns_only_url_and_details_are_retired():
    with TestClient(app) as client:
        result = client.post("/api/vendors/search", json={"category": "photographer", "city": "Amritsar"}).json()
        assert result["results"] == []
        assert "Amritsar" in result["map_search_url"]
        assert result["mode"] == "maps_link"
        assert client.get("/api/vendors/old-place-id").status_code == 410
