"""Loads the reviewed-once starter catalog outside the pure planning engine."""

import json
from functools import lru_cache
from pathlib import Path
from typing import cast

from ..schemas.catalog import EventCatalog


@lru_cache(maxsize=1)
def load_event_catalog() -> EventCatalog:
    catalog_path = Path(__file__).resolve().parents[1] / "engine" / "data" / "event_catalog.json"
    return cast(EventCatalog, json.loads(catalog_path.read_text(encoding="utf-8")))
