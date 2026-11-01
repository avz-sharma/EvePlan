
You are a senior engineer inheriting a codebase generated quickly by another agent: a FastAPI backend with a pure-Python planning engine, a React/Vite/TypeScript/Tailwind frontend with Framer Motion, and optional Groq for intent extraction and quote analysis. It works, but it is sloppy. In every phase, improve it without breaking it.
How to work (every phase)
• Audit before you touch anything. Read the code paths involved, list concrete problems (duplication, dead code, giant components, inconsistent styling, leaky abstractions, missing tests) and write them to docs/phase-N-audit.md.
• Prefer deleting and consolidating over adding. Every new file, dependency or abstraction must earn its place in one sentence.
• Work in small, reviewable commits. Run lint, type checks and tests after each step and never leave the build red.
• Do not invent facts. If something is ambiguous, pick the simplest option, record it under Assumptions in your report, and continue.
• Finish with docs/phase-N-report.md: what changed, what you deliberately left alone, assumptions, and how to verify.
Non-negotiables (carried over from the plan file)
• The engine (budget, DAG, cascade, plan builder) stays pure Python: no network, LLM or file I/O imports. Enforce this with an architecture test that parses imports.
• No fabricated prices. Allocation percentages and heuristics live in one documented config labeled as planning heuristics, never market rates.
• Animate only transform and opacity (bars use scaleX, never width). Respect prefers-reduced-motion.
• The app must run with no GROQ_API_KEY and with no Maps key: degraded mode, deterministic fallbacks, saved fixtures.
• Use the Groq model configured through GROQ_MODEL, at most one LLM call per replan, a quota guard, and no database (plan state lives client-side).
• Secrets only in env vars. Keep .env.example current. No keys in the repo or the bundle, except a referrer-restricted Maps browser key.
• Accessibility is a feature: keyboard paths, visible focus, labels, aria-live for streamed text, text alternatives for graphics.
Carry-over checklist (verify each; fix if missing)
• GROQ_API_KEY is optional (SecretStr or None) and the app starts without it.
• The fallback parser accepts both '40 extra guests' and '+40 guests' orders, handles per-plate increases, date shifts and venue loss, and understands Indian number forms like 2.5L and 2 lakh.
• The LLM-facing schema is a flat model that is re-validated into the strict internal model.
• Demo scenario fixtures are real validated outputs committed to the repo and labeled 'saved' in the UI.
• Prompt length is capped (about 500 characters) in Pydantic, and state size and field lengths are validated server-side.
• Deployment exists: Dockerfile, Cloud Run notes, static frontend host, live URL in the README.
