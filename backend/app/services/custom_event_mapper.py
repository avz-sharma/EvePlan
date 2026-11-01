"""Optional custom-event mapping with a deterministic saved-fixture fallback."""

import json
from functools import lru_cache
from pathlib import Path
from typing import cast

from .event_catalog import load_event_catalog


@lru_cache(maxsize=1)
def _mapping_fixtures() -> list[dict[str, str]]:
    path = Path(__file__).resolve().parents[1] / "fixtures" / "custom_event_mappings.json"
    return cast(list[dict[str, str]], json.loads(path.read_text(encoding="utf-8"))["mappings"])


def suggest_catalog_event(text: str) -> dict[str, str] | None:
    """Find a saved alias and return its current catalog display name."""
    normalized = " ".join(text.casefold().split())
    match = next((item for item in _mapping_fixtures() if item["phrase"] == normalized), None)
    if match is None:
        return None
    catalog_event = next(
        (item for item in load_event_catalog()["events"] if item["id"] == match["catalog_id"]), None
    )
    if catalog_event is None:
        return None
    return {
        "catalog_id": match["catalog_id"],
        "display_name": catalog_event["display_name"],
        "source": "saved_fixture",
    }
