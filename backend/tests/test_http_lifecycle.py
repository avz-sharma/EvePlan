from fastapi.testclient import TestClient

from app.main import app


def test_api_starts_without_maps_client():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert not hasattr(app.state, "places_client")
