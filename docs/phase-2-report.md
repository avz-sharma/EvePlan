# Phase 2 Report

## What changed

- Replaced the first-launch demo wedding with a five-step, event-first wizard. The plan has one to five days and event selections before the host enters plan details. The religion question and field are absent. The supplied lotus EvePlan logo is used in the app header.
- Added the JSON starter event catalog, event-relative tasks for each vendor need, cross-event venue-to-menu dependencies, budget buckets, inferred profile hints, cascade edits, vendor assignment checks, bounded state validation, and generated scenario plans. The builder receives catalog data and remains deterministic and separate from file and network access.
- Added four example selections that use the same builder, a free-text custom-event path with deterministic catalog suggestions from saved aliases, plus an Events tab for editing the built plan. A canonical set of builder-produced scenario outputs is committed as a validation snapshot; the API regenerates scenarios against each active plan.
- Added Places API (New) text search with a strict Pro-level search field mask, an explicit place-details call for Enterprise fields, server-side request validation and quota limits, an ID-only short-lived cache, and Google Maps link/manual-entry fallback. The lazy Vendors tab shows Places results next to a Google map, supports user-authored assignments and branch-specific state, and updates task and budget state through the pure builder.
- Removed hard-coded sample quote amounts and assumed add-on prices. Quote comparisons use host-entered values and show explicitly excluded items without estimating their amounts. Automatic extraction is not available; the upload endpoint validates file type/size and then returns a clear not-implemented response.
- Derived `profile_hints` stay in the live plan response only and are stripped from active-plan and branch browser storage. If a plan has no catering allocation, quote comparison asks the host to enter a budget cap before comparing.
- Updated event-aware Overview, Timeline, and Budget displays, API schemas, environment documentation, setup notes, traceability, and the requested logo asset.

## Places data and display decision

EvePlan stores only a selected Place ID from Google Places. Event plans may also hold fields authored by the host (notes, quote, category cap, and capacity); search display name, address, location, rating, phone, and website are kept in the browser only for the current result/detail view. The process-local 30-second query cache contains Place IDs only. It reports whether a query key has been seen but does not serve cached display content, so every visible search still calls Text Search (New).

Places results appear only alongside the Google map, which provides Google Maps attribution. Result cards also link to Google Maps. We do not request photos, reviews, or AI summaries. Rating, phone, and website are fetched only after the user selects “Show rating and contact”, through a separate field-masked Place Details (New) request. A public deployment still needs publicly accessible Terms of Use and a Privacy Policy incorporating Google's terms. This implementation records the policy decision but does not create or publish those legal pages.

The search mask requests `places.id`, `places.displayName`, `places.formattedAddress`, `places.location`, and `places.types`. Google classifies the display fields in that mask as Text Search Pro fields; requesting rating, phone, or website is separately billed at the Place Details Enterprise SKU. The app bounds local use with configurable per-minute and daily counters and degrades search to a Maps link on local quota exhaustion, upstream quota/rate errors, server errors, or network failure. These application limits reduce accidental spend but do not guarantee free Google usage; project billing, quotas, and current SKU pricing remain controlled in Google Cloud. Re-fetching every visible query also means the ID cache does not avoid Text Search charges. Its 30-second ID-only record exposes a cache-hit flag for diagnostics, but the app still refreshes display content on every search.

References checked against Google's current documentation:

- [Places API policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Text Search (New) fields and SKU levels](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Place Details (New) fields and SKU levels](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Places API usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- [Place ID storage and refresh guidance](https://developers.google.com/maps/documentation/places/web-service/place-id)

## Assumptions

- The checkout did not contain the referenced Appendix A. The catalog is therefore a clearly marked starter containing only the events named in the task. It needs review by people from each represented community before it is treated as cultural guidance.
- The catalog's duration, venue hints, vendor categories, task names, and lead times are planning defaults, not claims about what every host needs. Hosts can edit their plan and should confirm requirements.
- Special diets and counts are host-provided. Tradition tags only contribute prompts such as asking whether a host wants halal meals or prefers particular ceremony wording; the plan persists event selections and explicit needs, not a religion field or inferred diet counts.
- Per-plate figures come from onboarding inputs. Non-catering categories remain “not estimated” until a host enters a quote. Contingency, example guest changes, and trade-off percentages are centralized in `backend/app/engine/planning_heuristics.py` and are labeled planning heuristics, not market rates.
- The quota guard is in-process memory, appropriate for the current single-process demo/local deployment. Multi-worker deployments need a shared counter to enforce project-wide application limits.
- Google Maps and Places behavior requires both the server Places key and browser Maps JavaScript key. Without them, manual entry and a deep link to Google Maps remain available.

## Deliberately left alone

- Quote comparison remains available with manually entered vendor values. The old file validation is retained for upload safety, but automatic quote extraction is unavailable and does not return sample data. The existing Gemini intent-editing path remains available and now rebuilds event plans; no database or server-side plan persistence was added.
- No OSM/Nominatim provider was added. The user-facing no-key path is the Maps link and manual entry, which does not make public Nominatim requests or require its separate usage-policy handling.
- No LLM is used to map custom event text. Reviewed fixture aliases provide deterministic suggestions, while the user's original free text remains the chosen custom event.
- No browser-key or server-key values were added to the repository. Both are optional in `.env.example`.
- No deployment URLs are listed because no frontend or API service has been published from this workspace; `docs/deployment.md` has the release record.

## How to verify

From `backend/`:

```powershell
python -m pytest -q
ruff check app/ tests/
```

From `frontend/`:

```powershell
npm run lint
npm test
npm run build
```

Regenerate OpenAPI and frontend types with `npm run sync-types` from `frontend/`. Then start the backend and frontend using the setup steps in the root README. On a fresh browser profile, confirm the event-first wizard opens, each of the four examples reaches review, and Events/Vendors actions preserve the active branch. For live Places results, configure both keys with the documented API and referrer restrictions; with either key unset, confirm Maps link and manual entry mode.
