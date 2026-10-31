import json

import httpx
import pytest
from pydantic import ValidationError

from app.routers.vendor_search_router import VendorSearchRequest
from app.services.quota_guard import QuotaState
from app.services.vendor_search import (
    DETAIL_FIELD_MASK,
    SEARCH_FIELD_MASK,
    GooglePlacesProvider,
    MapsLinkProvider,
    PlaceIdCache,
    VendorSearchQuery,
    VendorSearchService,
)


class MockResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload
        self.text = json.dumps(payload)

    def json(self) -> dict:
        return self._payload


class MockHttpClient:
    def __init__(self, handler):
        self.handler = handler
        self.requests: list[httpx.Request] = []

    def request(self, method, url, *, headers, json=None):
        request = httpx.Request(method, url, headers=headers, json=json)
        self.requests.append(request)
        status_code, payload = self.handler(request)
        return MockResponse(status_code, payload)


def test_google_text_search_contract_and_field_mask() -> None:
    client = MockHttpClient(lambda request: (200, {"places": [{
        "id": "ChIJabc", "displayName": {"text": "Garden Hall"},
        "formattedAddress": "Pune, India", "location": {"latitude": 18.52, "longitude": 73.85},
        "types": ["event_venue"],
    }]}))
    provider = GooglePlacesProvider("secret-test-key", client=client)
    results = provider.search(VendorSearchQuery("venue", lat=18.52, lng=73.85, radius_m=12000))
    request = client.requests[0]
    assert len(results) == 1
    assert request.method == "POST"
    assert str(request.url) == "https://places.googleapis.com/v1/places:searchText"
    assert request.headers["X-Goog-FieldMask"] == SEARCH_FIELD_MASK
    assert request.headers["X-Goog-Api-Key"] == "secret-test-key"
    body = json.loads(request.content)
    assert body["maxResultCount"] == 20
    assert body["locationBias"]["circle"]["radius"] == 12000


def test_explicit_place_details_request_uses_enterprise_fields_only() -> None:
    client = MockHttpClient(lambda request: (200, {
        "id": "ChIJabc", "displayName": {"text": "Garden Hall"},
        "formattedAddress": "Pune, India", "rating": 4.5,
        "nationalPhoneNumber": "+91 20 1234 5678", "websiteUri": "https://example.test",
    }))
    provider = GooglePlacesProvider("test", client=client)
    details = provider.details("ChIJabc")
    assert details["rating"] == 4.5
    assert client.requests[0].method == "GET"
    assert client.requests[0].headers["X-Goog-FieldMask"] == DETAIL_FIELD_MASK
    assert {"rating", "nationalPhoneNumber", "websiteUri"}.issubset(DETAIL_FIELD_MASK.split(","))


def test_place_id_cache_expires_and_query_key_rounds_location() -> None:
    now = [0.0]
    cache = PlaceIdCache(ttl_seconds=10, clock=lambda: now[0])
    query = VendorSearchQuery("venue", lat=18.521, lng=73.851, radius_m=25000, keyword="hall")
    same_bucket = VendorSearchQuery("venue", lat=18.524, lng=73.854, radius_m=25000, keyword="HALL")
    assert query.cache_key == same_bucket.cache_key
    cache.set(query.cache_key, ["place-1"])
    assert cache.get(same_bucket.cache_key) == ("place-1",)
    now[0] = 11.0
    assert cache.get(query.cache_key) is None


def test_upstream_quota_error_degrades_to_maps_link_provider() -> None:
    client = MockHttpClient(lambda request: (429, {"error": {"message": "rate limit exceeded"}}))
    provider = GooglePlacesProvider("test", client=client)
    service = VendorSearchService(provider, QuotaState(rpm_limit=5, daily_limit=10), PlaceIdCache())
    response = service.search(VendorSearchQuery("caterer", city="Pune", keyword="vegetarian"))
    assert response["mode"] == "maps_link"
    assert "resting" in response["banner"]
    assert "google.com/maps/search/" in response["map_search_url"]


def test_coordinate_search_fallback_keeps_the_map_center_in_link() -> None:
    provider = MapsLinkProvider()
    url = provider.url(VendorSearchQuery("venue", lat=18.521, lng=73.851, radius_m=5_000))
    assert "18.52100%2C73.85100" in url


def test_local_daily_quota_guard_degrades_without_calling_google() -> None:
    client = MockHttpClient(lambda request: (200, {"places": []}))
    provider = GooglePlacesProvider("test", client=client)
    service = VendorSearchService(provider, QuotaState(rpm_limit=5, daily_limit=0), PlaceIdCache())
    response = service.search(VendorSearchQuery("venue", city="Pune"))
    assert response["mode"] == "maps_link"
    assert client.requests == []


def test_search_request_rejects_bad_locations_and_overlong_keywords() -> None:
    with pytest.raises(ValidationError):
        VendorSearchRequest(category="venue", lat=18.5)
    with pytest.raises(ValidationError):
        VendorSearchRequest(category="venue")
    with pytest.raises(ValidationError):
        VendorSearchRequest(category="venue", city="Pune", keyword="x" * 81)
    with pytest.raises(ValidationError):
        VendorSearchRequest(category="venue", city="Pune", radius_m=60_000)
    assert VendorSearchRequest(category="venue", city="Pune").category == "venue"
