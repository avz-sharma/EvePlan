"""Gemini SDK structured extraction service with SHA-256 state caching.

Uses google-genai SDK for intent extraction and rationale generation.
Wraps user prompts in <untrusted_user_input> tags for prompt defense (LAW-06).
Implements an in-memory LRU cache keyed by sha256(plan_state + prompt)
so repeated demo clicks consume zero API quota.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections import OrderedDict
from pathlib import Path
from typing import Any

from ..config import settings
from ..schemas.intent_delta import PlanDelta
from ..services.quota_guard import quota_guard

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

# LRU Cache with max 128 entries
_CACHE_MAX = 128
_extraction_cache: OrderedDict[str, dict[str, Any]] = OrderedDict()


class IntentExtractionUnavailable(Exception):
    """The caller should use the deterministic parser without another LLM call."""


def _cache_key(plan_json: str, user_prompt: str) -> str:
    """Generate a deterministic cache key from plan state and user prompt."""
    normalized_prompt = " ".join(user_prompt.lower().split())
    payload = plan_json + "||" + normalized_prompt
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> dict[str, Any] | None:
    """Retrieve from LRU cache, moving accessed item to end."""
    if key in _extraction_cache:
        _extraction_cache.move_to_end(key)
        return _extraction_cache[key]
    return None


def _cache_put(key: str, value: dict[str, Any]) -> None:
    """Insert into LRU cache, evicting oldest if at capacity."""
    _extraction_cache[key] = value
    _extraction_cache.move_to_end(key)
    while len(_extraction_cache) > _CACHE_MAX:
        _extraction_cache.popitem(last=False)


def _load_prompt_template(name: str) -> str:
    """Load a versioned prompt template from the prompts/ directory."""
    path = _PROMPTS_DIR / name
    return path.read_text(encoding="utf-8")


def is_gemini_available() -> bool:
    """Check if a Gemini API key is configured and quota is available."""
    if settings.GEMINI_API_KEY is None:
        return False
    key_val = settings.GEMINI_API_KEY.get_secret_value()
    if not key_val or key_val.strip() == "":
        return False
    return quota_guard.remaining_daily() > 0


def extract_intent_delta(
    plan_state_json: str,
    user_prompt: str,
) -> tuple[dict[str, Any], bool]:
    """Extract a PlanDelta from natural language using Gemini structured output.

    Returns:
        tuple[dict, bool]: (plan_delta_dict, is_from_cache)

    Falls back to returning a minimal delta if Gemini is unavailable.
    """
    cache_key = _cache_key(plan_state_json, user_prompt)
    cached = _cache_get(cache_key)
    if cached is not None:
        logger.info("Cache hit for intent extraction (sha256=%s)", cache_key[:12])
        return cached, True

    if not is_gemini_available():
        # Preserve the direct helper's Phase 1 no-key contract. The route selects
        # the deterministic parser before calling this helper in that mode.
        return PlanDelta().model_dump(), False

    if not quota_guard.try_acquire():
        raise IntentExtractionUnavailable("Intent quota is resting")

    try:
        from google import genai

        api_key = settings.GEMINI_API_KEY
        assert api_key is not None
        client = genai.Client(api_key=api_key.get_secret_value())

        prompt_template = _load_prompt_template("v1_intent_delta.txt")
        full_prompt = prompt_template.replace("{user_prompt}", user_prompt)

        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=full_prompt,
            config={
                "response_mime_type": "application/json",
                "temperature": 0.1,
            },
        )

        if response.text:
            raw_text = response.text.strip()
            # Strip markdown fences if present
            if raw_text.startswith("```"):
                lines = raw_text.split("\n")
                lines = [ln for ln in lines if not ln.startswith("```")]
                raw_text = "\n".join(lines)
            result = json.loads(raw_text)
            # Validate through Pydantic
            validated = PlanDelta(**result)
            result_dict = validated.model_dump()
            _cache_put(cache_key, result_dict)
            return result_dict, False
        else:
            raise IntentExtractionUnavailable("Gemini returned no intent")

    except Exception as error:
        # SDK exceptions can include request details; log only their type.
        logger.warning("Gemini extraction unavailable (%s)", type(error).__name__)
        raise IntentExtractionUnavailable("Use the deterministic intent parser") from error
