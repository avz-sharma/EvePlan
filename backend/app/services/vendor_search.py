"""Keyless Maps URL compatibility search. No network requests or business records."""

from urllib.parse import quote


def maps_search_url(category: str, location: str, keyword: str = "") -> str:
    """Encode a bounded Maps search URL without requesting external listings."""
    query = " ".join(f"{category} {keyword} in {location}".split())
    url = "https://www.google.com/maps/search/?api=1&query=" + quote(query, safe="")
    if len(url) > 2048:
        raise ValueError("Search URL exceeds 2048 characters")
    return url
