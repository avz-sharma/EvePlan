# EvePlan

EvePlan turns a multi-day celebration into an editable event plan. Choose days and events first, then enter guest counts, budgets, dietary counts, accessibility needs, and a first event date. Tasks, event-relative dates, budget totals, and vendor fit are rebuilt from those choices.

Plans and vendor selections are stored in the browser. The Python builder is deterministic and accepts catalog data from the API boundary. A missing Gemini key does not prevent plan creation. A missing Google key leaves vendor search usable through Maps links and manual entry.

## Local setup

Requirements: Python 3.12 or newer, Node.js 20 or newer, and pnpm.

Copy `.env.example` to `.env` at the repository root. All keys are optional for local planning. The Vite config reads that root environment file.

### Backend

```powershell
cd backend
python -m pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

In another terminal, run the backend checks:

```powershell
cd backend
pytest
ruff check app/ tests/
```

### Frontend

```powershell
cd frontend
pnpm install
pnpm run dev
```

Open `http://localhost:5173`. The first screen is the days-and-events wizard. Plans are saved locally in the browser; the backend does not keep plan state.

Run the frontend checks with `pnpm run lint`, `pnpm test`, and `pnpm run build` from `frontend`.

## Optional API keys

### Gemini

`GEMINI_API_KEY` enables optional natural-language plan edits. The default model is `gemini-2.5-flash-lite`; the planner and event builder work without this key.

### Google Maps and Places

Vendor search needs two separate keys:

- `GOOGLE_PLACES_API_KEY` is server-only. Enable Places API (New) and restrict this key to that API. Keep the value out of the browser bundle.
- `VITE_GOOGLE_MAPS_BROWSER_KEY` is public browser configuration. Enable Maps JavaScript API and restrict this key by the app's HTTP referrers and to Maps JavaScript API.

The Places key returns only place ID, display name, address, location, and types during search. Rating, phone, and website are fetched from the separate place-details endpoint only after a person requests details. The app keeps only place IDs from Places in its plan; notes, quotes, and capacity are user-entered. Search results are shown with a Google map. Without the browser key or server key, EvePlan uses a Google Maps search link and manual vendor entry.

Before enabling Places for a public deployment, publish Terms of Use and a Privacy Policy that incorporate Google's current terms and privacy policy. See [Google Places policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies).

Quota limits can be set with `GOOGLE_PLACES_RPM_LIMIT` and `GOOGLE_PLACES_DAILY_LIMIT`. Search quota or provider errors return a visible map-link fallback.

## Event catalog

The starter catalog lives at `backend/app/engine/data/event_catalog.json`. It is a draft assembled from the event examples in the project brief, not a complete cultural reference. People from each represented community should review event names, durations, venue hints, vendor needs, and task templates before production use. Internal inference tags are not returned to the browser.

The builder uses user-entered per-plate ranges and vendor quotes. A category with no user-entered amount is labeled “not estimated”; EvePlan does not treat that as a market price.

The Quotes tab compares amounts entered from a vendor's written quote. It does not extract or invent amounts from uploaded files. Automatic file extraction is not available in this build.

## Project notes

- Requirement-to-file and test mapping: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- Phase 2 audit: [docs/phase-2-audit.md](docs/phase-2-audit.md)
- Phase 2 implementation report: [docs/phase-2-report.md](docs/phase-2-report.md)
- Deployment notes: [docs/deployment.md](docs/deployment.md)
- Deployment status: no live frontend or API has been published from this workspace yet; add the real URLs here after deployment.
