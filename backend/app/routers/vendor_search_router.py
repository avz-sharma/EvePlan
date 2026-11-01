"""Keyless Maps search compatibility routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..schemas.plan_state import VendorCategory
from ..services.vendor_search import maps_search_url

router = APIRouter(prefix="/api/vendors", tags=["Vendor Search"])


class VendorSearchRequest(BaseModel):
    """Bounded search terms for keyless external Maps navigation."""

    model_config = ConfigDict(extra="forbid")
    category: VendorCategory
    city: str = Field(min_length=1, max_length=120)
    keyword: str = Field(default="", max_length=80)

    @field_validator("city")
    @classmethod
    def nonempty_city(cls, value: str) -> str:
        """Require a city after trimming whitespace from the search request."""
        if not value.strip():
            raise ValueError("Enter a city")
        return value.strip()


@router.post("/search")
async def search_vendors(request: VendorSearchRequest) -> dict[str, object]:
    """Return a Maps search link without importing business listings."""
    try:
        url = maps_search_url(request.category.value, request.city, request.keyword)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"mode": "maps_link", "results": [], "map_search_url": url, "banner": None}


@router.get("/{place_id}")
async def get_vendor_details(place_id: str) -> None:
    """Explain the unavailable legacy vendor detail endpoint."""
    raise HTTPException(
        status_code=410,
        detail="Business details are available on Google Maps. No Places API is used.",
    )
