# Security review

Reviewed November 2, 2026. These results describe this checkout and the vulnerability databases consulted during the run; they do not predict future advisories.

## Automated checks

- Bandit: no low, medium or high findings in application Python, excluding vendored static assets and test assertions as before.
- `pip-audit --disable-pip --require-hashes`: no known vulnerabilities in either runtime or development locks.
- `pnpm audit`: no known vulnerabilities. The only dependency declaration added is test-only `axe-core@4.14.0`, already present transitively through `vitest-axe`. Real-browser contrast/axe checks import it directly; Knip required that declaration. The lock change adds only that importer entry, without changing resolved package versions.
- Gitleaks: redacted scan of all Git history found no leaks. The existing CI history scan still verifies the scanner archive checksum. Local reports use redaction; this work did not inspect or modify secret files.
- The shared `scripts/check.py` runs the original gates plus Python formatting and public-docstring checks. Existing coverage thresholds, ESLint rules, CSP, request limits, security headers, container behavior and deployment files remain intact.

## Authentication and CSRF

The OAuth flow uses signed purpose-bound state and a PKCE S256 challenge. Google exchanges happen server-side with a timeout and redirects disabled. A verified Google subject is required. Flow cookies expire after ten minutes; session cookies after eight hours. Both are HttpOnly, SameSite=Lax and Path=/; Secure is set for HTTPS application origins. Public HTTP origins are rejected by configuration validation.

Protected API writes require an exact `Origin` match after session authentication. Logout also requires the application origin. Vercel always requires authentication even when `AUTH_REQUIRED=false` is configured. Tests cover bad state, incorrect PKCE rejected by the provider, expired/tampered/wrong-purpose cookies, malformed identities, failed exchanges, HTTPS flags and cross-origin writes. Google calls are mocked. Provider details and credentials are not logged.

## Input and model boundaries

Request bodies are bounded by declared and observed length, with a process-local per-client rate window and bounded client tracking. Prompt length is capped at 500 characters; plan text, lists, guests, quote amounts and reserve percentages have schema constraints. Non-finite values are rejected. The validation handler preserves the existing `detail` list shape and makes invalid NaN/infinity inputs JSON-safe instead of causing a response serialization failure. Calendar overflows and guest-count changes outside the supported total produce readable errors.

Groq intent output is validated as `PlanDelta`; quote advice is validated as `QuoteAnalysis` and its winner/assessment IDs must match the requested candidates. Intent text is sanitized into a data boundary. Quote instructions explicitly treat all supplied JSON and quote text as untrusted data. React renders advice as text. Neither provider can directly mutate plan state; the pure engine computes changes and the host selects quotes. Tests mock provider timeouts, quota exhaustion, malformed JSON and invalid fields and verify deterministic fallback without another model call.

## Uploads, streaming and persistence

Legacy uploads read at most 5 MiB plus a sentinel byte, validate magic bytes and a three-page PDF limit, and return 501 for valid documents because extraction is unavailable. Tests exercise valid, corrupt and oversized submissions. No executable content is rendered by this endpoint.

SSE bypasses compression, retains disconnect notifications through the bounded-body middleware, and stops after disconnect. The client releases stream readers on errors and cancellation and exposes request failures. Browser storage errors now produce a visible status while preserving the in-memory plan; account storage keys and branch histories are unchanged.

## Operational limits

The browser stores plans locally; there is no database or cross-device synchronization. Signed sessions are not centrally revoked; logout clears the local cookie and key rotation invalidates issued sessions. Request and provider guards are per process/instance and reset on cold starts. They are safeguards rather than a billing guarantee. See [deployment.md](deployment.md) and [auth.md](auth.md) for configuration and secret storage.
