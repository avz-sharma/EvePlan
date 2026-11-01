"""Groq-backed intent extraction with validated output and deterministic fallback."""

from __future__ import annotations

import hashlib
import logging
from collections import OrderedDict
from pathlib import Path

import httpx

from ..config import settings
from ..schemas.intent_delta import PlanDelta
from .quota_guard import quota_guard
from .upload_validator import sanitize_untrusted_input

logger = logging.getLogger(__name__)
_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
MAX_CACHED_RESPONSES = 128
GROQ_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions"
INTENT_TIMEOUT_SECONDS = 20.0
_extraction_cache: OrderedDict[str, PlanDelta] = OrderedDict()


class IntentExtractionUnavailable(Exception):
    """The caller should use the deterministic parser."""


def _cache_key(plan_json: str, user_prompt: str) -> str:
    normalized_prompt = " ".join(user_prompt.lower().split())
    return hashlib.sha256((plan_json + "||" + normalized_prompt).encode("utf-8")).hexdigest()


def _load_prompt_template() -> str:
    return (_PROMPTS_DIR / "v1_intent_delta.txt").read_text(encoding="utf-8")


def is_groq_available() -> bool:
    key = settings.GROQ_API_KEY
    return bool(key and key.get_secret_value().strip() and quota_guard.remaining_daily() > 0)


def extract_intent_delta(plan_state_json: str, user_prompt: str) -> tuple[PlanDelta, bool]:
    """Ask Groq for a JSON intent delta; validate it before returning it to the engine."""
    cache_key = _cache_key(plan_state_json, user_prompt)
    cached = _extraction_cache.get(cache_key)
    if cached is not None:
        _extraction_cache.move_to_end(cache_key)
        return cached.model_copy(deep=True), True
    if not is_groq_available() or not quota_guard.try_acquire():
        raise IntentExtractionUnavailable("Groq is unavailable or quota-limited")

    key = settings.GROQ_API_KEY
    assert key is not None
    prompt = _load_prompt_template().replace("{user_prompt}", sanitize_untrusted_input(user_prompt))
    try:
        response = httpx.post(
            GROQ_COMPLETIONS_URL,
            headers={"Authorization": f"Bearer {key.get_secret_value()}", "Content-Type": "application/json"},
            json={
                "model": settings.GROQ_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 1.0,
                "top_p": 0.95,
                "reasoning_effort": "default",
                "reasoning_format": "hidden",
                "max_completion_tokens": 2048,
            },
            timeout=INTENT_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        result = PlanDelta.model_validate_json(content)
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
        logger.warning("Groq intent extraction unavailable (%s)", type(error).__name__)
        raise IntentExtractionUnavailable("Use deterministic intent parsing") from error

    _extraction_cache[cache_key] = result.model_copy(deep=True)
    while len(_extraction_cache) > MAX_CACHED_RESPONSES:
        _extraction_cache.popitem(last=False)
    return result, False
