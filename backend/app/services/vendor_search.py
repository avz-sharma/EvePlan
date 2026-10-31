"""Places API providers, ID-only TTL cache, and quota-aware provider fallback."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import quote_plus

import httpx

from .quota_guard import QuotaState

SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.types"
DETAIL_FIELD_MASK = "id,displayName,formattedAddress,rating,nationalPhoneNumber,websiteUri"
PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_BASE_URL = "https://places.googleapis.com/v1/places"
CATEGORY_TERMS = {
    "venue": "event venue",
    "caterer": "caterer",
    "decorator": "event decorator",
    "photographer": "event photographer",
    "makeup": "event makeup artist",
    "music": "event music and sound",
    "transport": "event transport service",
}


@dataclass(frozen=True)
class VendorSearchQuery:
    category: str
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    radius_m: int = 25_000
    keyword: str | None = None

    @property
    def text_query(self) -> str:
        parts = [CATEGORY_TERMS[self.category]]
        if self.keyword:
            parts.append(self.keyword.strip())
        if self.city:
            parts.append(self.city.strip())
        return " ".join(parts)

    @property
    def cache_key(self) -> str:
        location = (self.city or "").strip().casefold()
        if self.lat is not None and self.lng is not None:
            location = f"{self.lat:.2f},{self.lng:.2f},r{self.radius_m}"
        return f"{self.category}|{location}|{(self.keyword or '').strip().casefold()}"


class VendorSearchProvider(Protocol):
    name: str

    def search(self, query: VendorSearchQuery) -> list[dict[str, Any]]: ...


class GooglePlacesError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail

    @property
    def is_quota_error(self) -> bool:
        message = self.detail.casefold()
        return self.status_code == 429 or (
            self.status_code == 403 and any(term in message for term in ("quota", "resource_exhausted", "rate limit"))
        )


class GooglePlacesProvider:
    name = "google_places"

    def __init__(self, api_key: str, client: httpx.Client | None = None):
        self.api_key = api_key
        self.client = client

    def _request(self, method: str, url: str, *, headers: dict[str, str], json_body: dict[str, Any] | None = None) -> dict[str, Any]:
        if self.client is not None:
            response = self.client.request(method, url, headers=headers, json=json_body)
        else:
            with httpx.Client(timeout=8.0) as client:
                response = client.request(method, url, headers=headers, json=json_body)
        if response.status_code >= 400:
            try:
                detail = str(response.json().get("error", {}).get("message", response.text))
            except (ValueError, AttributeError):
                detail = response.text
            raise GooglePlacesError(response.status_code, detail)
        return response.json()

    def search(self, query: VendorSearchQuery) -> list[dict[str, Any]]:
        body: dict[str, Any] = {"textQuery": query.text_query, "maxResultCount": 20}
        if query.lat is not None and query.lng is not None:
            body["locationBias"] = {
                "circle": {
                    "center": {"latitude": query.lat, "longitude": query.lng},
                    "radius": query.radius_m,
                }
            }
        payload = self._request(
            "POST", PLACES_SEARCH_URL,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": SEARCH_FIELD_MASK,
            },
            json_body=body,
        )
        results = []
        for place in payload.get("places", [])[:20]:
            if not place.get("id"):
                continue
            display_name = place.get("displayName", {})
            location = place.get("location", {})
            results.append({
                "place_id": place["id"],
                "display_name": display_name.get("text", "Place"),
                "formatted_address": place.get("formattedAddress", ""),
                "location": {"lat": location.get("latitude"), "lng": location.get("longitude")},
                "types": place.get("types", []),
                "maps_url": google_maps_place_url(place["id"], display_name.get("text", "Place"), place.get("formattedAddress", "")),
            })
        return results

    def details(self, place_id: str) -> dict[str, Any]:
        if "/" in place_id or "?" in place_id or "#" in place_id:
            raise ValueError("Invalid place id")
        return self._request(
            "GET", f"{PLACES_BASE_URL}/{quote_plus(place_id)}",
            headers={
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": DETAIL_FIELD_MASK,
            },
        )


def google_maps_place_url(place_id: str, name: str, address: str) -> str:
    query = quote_plus(" ".join(part for part in (name, address) if part))
    return f"https://www.google.com/maps/search/?api=1&query={query}&query_place_id={quote_plus(place_id)}"


class MapsLinkProvider:
    name = "maps_link"

    def search(self, query: VendorSearchQuery) -> list[dict[str, Any]]:
        return []

    def url(self, query: VendorSearchQuery) -> str:
        text_query = query.text_query
        if query.lat is not None and query.lng is not None:
            text_query = f"{text_query} near {query.lat:.5f},{query.lng:.5f}"
        return f"https://www.google.com/maps/search/?api=1&query={quote_plus(text_query)}"


class PlaceIdCache:
    """Short-lived query cache containing only place IDs, as allowed by Places policy."""

    def __init__(self, ttl_seconds: int = 30, clock=time.monotonic):
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self._items: dict[str, tuple[float, tuple[str, ...]]] = {}

    def get(self, key: str) -> tuple[str, ...] | None:
        record = self._items.get(key)
        if record is None:
            return None
        expires, place_ids = record
        if self.clock() >= expires:
            self._items.pop(key, None)
            return None
        return place_ids

    def set(self, key: str, place_ids: list[str]) -> None:
        self._items[key] = (self.clock() + self.ttl_seconds, tuple(place_ids))


class VendorSearchService:
    def __init__(self, provider: VendorSearchProvider, quota: QuotaState, cache: PlaceIdCache):
        self.provider = provider
        self.quota = quota
        self.cache = cache
        self.maps = MapsLinkProvider()

    def search(self, query: VendorSearchQuery) -> dict[str, Any]:
        if self.provider.name == "maps_link":
            return self._maps_response(query, "Map search is resting; open in Google Maps.")
        if not self.quota.try_acquire():
            return self._maps_response(query, "Map search is resting; open in Google Maps.")
        try:
            # Google disallows caching returned display content. The ID cache is kept for
            # query de-duplication/telemetry, while every visible search is fetched fresh.
            prior_ids = self.cache.get(query.cache_key)
            results = self.provider.search(query)
            self.cache.set(query.cache_key, [str(item["place_id"]) for item in results])
            return {
                "mode": "google_places",
                "results": results,
                "map_search_url": None,
                "banner": None,
                "attribution": "Google Maps",
                "id_cache_hit": prior_ids is not None,
            }
        except GooglePlacesError as error:
            if error.is_quota_error or error.status_code >= 500:
                return self._maps_response(query, "Map search is resting; open in Google Maps.")
            raise
        except httpx.HTTPError:
            return self._maps_response(query, "Map search is resting; open in Google Maps.")

    def details(self, place_id: str) -> dict[str, Any]:
        if not isinstance(self.provider, GooglePlacesProvider):
            raise GooglePlacesError(503, "Place details are unavailable without a Google Places key.")
        if not self.quota.try_acquire():
            raise GooglePlacesError(429, "Google Places quota limit reached.")
        data = self.provider.details(place_id)
        return {
            "place_id": data.get("id", place_id),
            "display_name": data.get("displayName", {}).get("text", ""),
            "formatted_address": data.get("formattedAddress", ""),
            "rating": data.get("rating"),
            "phone": data.get("nationalPhoneNumber"),
            "website": data.get("websiteUri"),
            "attribution": "Google Maps",
        }

    def _maps_response(self, query: VendorSearchQuery, banner: str) -> dict[str, Any]:
        return {
            "mode": "maps_link",
            "results": [],
            "map_search_url": self.maps.url(query),
            "banner": banner,
            "attribution": None,
            "id_cache_hit": False,
        }
