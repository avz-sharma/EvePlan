"""Tests for fallback parser, quota guard, and Groq extractor (mocked).

Covers:
- Deterministic regex extraction for all 4 chaos pill scenarios
- Quota guard token bucket exhaustion and reset
- Graceful degradation when GROQ_API_KEY is unset
- No outbound network call when API key is unset
"""

from unittest.mock import patch

from app.services.fallback_parser import parse_user_intent
from app.services.groq_extractor import IntentExtractionUnavailable, is_groq_available
from app.services.quota_guard import QuotaState

# ---------------------------------------------------------------------------
# Fallback Parser Tests
# ---------------------------------------------------------------------------


class TestFallbackParser:
    """Deterministic regex parser must handle all 4 chaos pill scenarios."""

    def test_guest_surge_with_jain(self) -> None:
        text = "Cousin bringing 40 extra guests + needs Jain counter"
        delta, extracted = parse_user_intent(text)
        assert extracted is True
        assert delta.guest_count_delta == 40

    def test_guest_surge_reversed_order(self) -> None:
        """Free-tier review: accept 'extra N guests' and 'N extra guests'."""
        text = "Adding extra 25 guests for Sangeet"
        delta, extracted = parse_user_intent(text)
        assert extracted is True
        assert delta.guest_count_delta == 25

    def test_guest_surge_plus_without_space(self) -> None:
        delta, extracted = parse_user_intent("+40 guests")
        assert extracted is True
        assert delta.guest_count_delta == 40

    def test_rain_indoor_relocation(self) -> None:
        text = "Venue garden lost due to rain forecast — move Haldi indoors"
        delta, extracted = parse_user_intent(text)
        assert extracted is True
        assert delta.indoor_relocation is True

    def test_date_moved_earlier_weeks(self) -> None:
        text = "Wedding date moved 2 weeks earlier"
        delta, extracted = parse_user_intent(text)
        assert extracted is True
        assert delta.days_until_event_delta == -14

    def test_per_plate_rate_hike(self) -> None:
        text = "Caterer increased per-plate rate by ₹250"
        delta, extracted = parse_user_intent(text)
        assert extracted is True
        assert delta.per_plate_delta_inr == 250.0

    def test_per_plate_rate_hike_alt_phrasing(self) -> None:
        text = "Per head rate hiked by 300"
        delta, extracted = parse_user_intent(text)
        assert extracted is True
        assert delta.per_plate_delta_inr == 300.0

    def test_venue_capacity_override(self) -> None:
        text = "venue capacity is 180"
        delta, extracted = parse_user_intent(text)
        assert extracted is True
        assert delta.venue_capacity_override == 180

    def test_budget_reduction(self) -> None:
        text = "budget cut by ₹500000"
        delta, extracted = parse_user_intent(text)
        assert extracted is True
        assert delta.budget_cap_inr_delta == -500000.0

    def test_budget_reduction_indian_lakh_forms(self) -> None:
        for text, expected in (("budget cut by 2.5L", -250000.0), ("budget lowered by 2 lakh", -200000.0)):
            delta, extracted = parse_user_intent(text)
            assert extracted is True
            assert delta.budget_cap_inr_delta == expected

    def test_per_plate_rate_accepts_indian_lakh_form(self) -> None:
        delta, extracted = parse_user_intent("per-plate rate increased by 2.5L")
        assert extracted is True
        assert delta.per_plate_delta_inr == 250000.0

    def test_no_match_returns_false(self) -> None:
        text = "The weather is lovely today"
        delta, extracted = parse_user_intent(text)
        assert extracted is False
        assert delta.guest_count_delta == 0

    def test_jain_dietary_extraction(self) -> None:
        text = "We need to add 15 Jain meals"
        delta, extracted = parse_user_intent(text)
        assert extracted is True
        assert delta.dietary_jain_delta == 15


# ---------------------------------------------------------------------------
# Quota Guard Tests
# ---------------------------------------------------------------------------


class TestQuotaGuard:
    def test_basic_acquire_and_decrement(self) -> None:
        guard = QuotaState(rpm_limit=5, daily_limit=10)
        assert guard.try_acquire() is True
        assert guard.remaining_daily() == 9

    def test_daily_exhaustion(self) -> None:
        guard = QuotaState(rpm_limit=100, daily_limit=3)
        assert guard.try_acquire() is True
        assert guard.try_acquire() is True
        assert guard.try_acquire() is True
        # 4th request should fail
        assert guard.try_acquire() is False
        assert guard.remaining_daily() == 0

    def test_rpm_exhaustion(self) -> None:
        guard = QuotaState(rpm_limit=2, daily_limit=100)
        guard.rpm_tokens = 2.0
        assert guard.try_acquire() is True
        assert guard.try_acquire() is True
        # RPM bucket drained, should fail even though daily is fine
        assert guard.try_acquire() is False


# ---------------------------------------------------------------------------
# Groq Extractor Tests (Mocked — No Network)
# ---------------------------------------------------------------------------


class TestGroqExtractor:
    def test_is_groq_available_returns_false_when_key_unset(self) -> None:
        """App must run with GROQ_API_KEY unset."""
        with patch("app.services.groq_extractor.settings") as mock_settings:
            mock_settings.GROQ_API_KEY = None
            assert is_groq_available() is False

    def test_is_groq_available_returns_false_when_key_empty(self) -> None:
        with patch("app.services.groq_extractor.settings") as mock_settings:
            from unittest.mock import MagicMock

            mock_key = MagicMock()
            mock_key.get_secret_value.return_value = ""
            mock_settings.GROQ_API_KEY = mock_key
            assert is_groq_available() is False

    def test_extract_intent_declines_without_key(self) -> None:
        """No outbound network call when API key is unset."""
        with patch("app.services.groq_extractor.settings") as mock_settings:
            mock_settings.GROQ_API_KEY = None
            from app.services.groq_extractor import extract_intent_delta

            try:
                extract_intent_delta("{}", "add 40 guests")
            except IntentExtractionUnavailable:
                pass
            else:
                raise AssertionError("expected deterministic fallback")

