from typing import Literal, Self

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..config import settings
from ..services.quota_guard import QuotaState
from ..services.vendor_search import (
    GooglePlacesError,
    GooglePlacesProvider,
    MapsLinkProvider,
    PlaceIdCache,
    VendorSearchQuery,
    VendorSearchService,
)

router = APIRouter(prefix="/api/vendors", tags=["Vendor Search"])
google_quota = QuotaState(
    rpm_limit=settings.GOOGLE_PLACES_RPM_LIMIT,
    rpm_tokens=float(settings.GOOGLE_PLACES_RPM_LIMIT),
    daily_limit=settings.GOOGLE_PLACES_DAILY_LIMIT,
)
place_id_cache = PlaceIdCache(ttl_seconds=30)


class VendorSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: Literal["venue", "caterer", "decorator", "photographer", "makeup", "music", "transport"]
    city: str | None = Field(default=None, min_length=2, max_length=120)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    radius_m: int = Field(default=25_000, ge=100, le=50_000)
    keyword: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def validate_search_area(self) -> Self:
        has_coordinates = self.lat is not None and self.lng is not None
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Provide both latitude and longitude")
        if bool(self.city and self.city.strip()) == has_coordinates:
            raise ValueError("Provide either a city or a latitude/longitude search center")
        if self.keyword is not None and len(self.keyword.strip()) > 80:
            raise ValueError("Keyword is limited to 80 characters")
        return self


def _service() -> VendorSearchService:
    key = settings.GOOGLE_PLACES_API_KEY
    if key is None or not key.get_secret_value().strip():
        provider = MapsLinkProvider()
    else:
        provider = GooglePlacesProvider(key.get_secret_value())
    return VendorSearchService(provider, google_quota, place_id_cache)


@router.post("/search")
def search_vendors(request: VendorSearchRequest) -> dict[str, object]:
    query = VendorSearchQuery(
        category=request.category,
        city=request.city,
        lat=request.lat,
        lng=request.lng,
        radius_m=request.radius_m,
        keyword=request.keyword,
    )
    try:
        return _service().search(query)
    except GooglePlacesError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.get("/{place_id}")
def get_vendor_details(place_id: str = Path(min_length=1, max_length=512)) -> dict[str, object]:
    try:
        return _service().details(place_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except GooglePlacesError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
