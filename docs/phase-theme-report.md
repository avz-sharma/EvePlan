# Theme and quotation-only vendor entry

Removed the manual entry form from Vendors and retained discovery and saved quote comparison. New entries go through Quotes. Applied deep blue #09318D, white and bubblegum pink #FF91CC with accessible dark text. Added an overview particle hero, a subtle spring cursor follower on fine-pointer devices, and real budget circular progress plus allocated, remaining and over-budget amounts on Overview and Budget. Motion respects reduced-motion preferences; canvas pauses when hidden and cleans up its observers/listeners. Original browser cursor and keyboard focus remain usable.

The circular gauge adapts the Magic UI component pattern to the existing React/Framer Motion stack. Particle code adapts the user-supplied reference without React renders per frame. Magic UI MCP was configured globally through Codex and its three registry tools were verified with an MCP handshake. Configuration stays outside application source.

Validation uses lint, unused exports, coverage tests, build, backend regression checks, audits and desktop/mobile Playwright journeys, including theme, budget percentage, reduced-motion behavior, canvas rendering, cursor and absence of direct vendor entry. Browser screenshots are generated for visual review.

Checks passed: 105 backend tests (87.04% coverage; engine 85%), 46 frontend tests (78.91% line coverage), TypeScript/ESLint, unused-code check, production build, Ruff, strict mypy, Bandit and npm/Python vulnerability audits. The final browser suite covers eight desktop/mobile journeys.
