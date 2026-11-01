"""In-process token bucket and daily request guard for optional Groq API usage.

Protects the daily and per-minute request budget from runaway consumption.
When limits are exhausted, flips the response to degraded_mode instead of erroring.
"""

import threading
import time
from dataclasses import dataclass, field


@dataclass
class QuotaState:
    """Tracks per-instance RPM and daily request limits for Groq calls."""

    # RPM (requests per minute) token bucket
    rpm_limit: int = 5
    rpm_tokens: float = 5.0
    rpm_last_refill: float = field(default_factory=time.monotonic)

    # Daily counter (resets every 24h from first request)
    daily_limit: int = 20
    daily_count: int = 0
    daily_reset_time: float = field(default_factory=lambda: time.monotonic() + 86400.0)

    # Lock for thread safety
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def _refill_rpm(self) -> None:
        """Refill RPM tokens based on elapsed time since last refill."""
        now = time.monotonic()
        elapsed = now - self.rpm_last_refill
        tokens_to_add = elapsed * (self.rpm_limit / 60.0)
        self.rpm_tokens = min(self.rpm_limit, self.rpm_tokens + tokens_to_add)
        self.rpm_last_refill = now

    def _reset_daily_if_needed(self) -> None:
        """Reset daily counter if 24 hours have elapsed."""
        now = time.monotonic()
        if now >= self.daily_reset_time:
            self.daily_count = 0
            self.daily_reset_time = now + 86400.0

    def try_acquire(self) -> bool:
        """Attempt to acquire a quota token. Returns True if allowed."""
        with self._lock:
            self._reset_daily_if_needed()
            self._refill_rpm()

            if self.daily_count >= self.daily_limit:
                return False
            if self.rpm_tokens < 1.0:
                return False

            self.rpm_tokens -= 1.0
            self.daily_count += 1
            return True

    def remaining_daily(self) -> int:
        """Return remaining daily quota."""
        with self._lock:
            self._reset_daily_if_needed()
            return max(0, self.daily_limit - self.daily_count)

    def seconds_until_rpm_available(self) -> float:
        """Estimate seconds until the next RPM token is available."""
        with self._lock:
            self._refill_rpm()
            if self.rpm_tokens >= 1.0:
                return 0.0
            deficit = 1.0 - self.rpm_tokens
            return deficit / (self.rpm_limit / 60.0)


# Module-level singleton used across the application
quota_guard = QuotaState()

