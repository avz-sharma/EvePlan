# Local setup


Use Python 3.12 or newer, Node 24 or newer, and pnpm 12.6.0. CI and the container use Python 3.12. From the repository root in PowerShell:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install --require-hashes -r backend/requirements-dev.lock
Copy-Item .env.example .env
.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

In a second terminal:

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm run dev
```

Open `http://localhost:5173`. API health is at `http://localhost:8000/health`; locally hosted Swagger and ReDoc are at `/docs` and `/redoc`. API settings and Vite both read the root `.env`. Environment variables override files. Add a Groq API key to enable AI features, and configure Google OAuth in [auth.md](auth.md) before signing in. Use AUTH_REQUIRED=false only for isolated local tests. On Linux/macOS, use `.venv/bin/python` instead of the Windows Python path.

## Environment


Groq is optional. Create a key in the [Groq Console](https://console.groq.com/keys) and paste it into `GROQ_API_KEY` in the repository-root `.env` file. The default model is `qwen/qwen3.8-27b`; override it with `GROQ_MODEL` if needed. Google OAuth credentials are required for sign-in; AUTH_REQUIRED=false enables isolated local testing only. Vendor discovery needs no API key.

When invoked, natural-language prompts are sent to Groq for intent extraction. Quote analysis sends the selected quote details and relevant event/plan context to Groq. Use sample or non-sensitive data for local trials; never place the API key in frontend variables.

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Server secret for optional Groq intent extraction and saved quote analysis. |
| `GROQ_MODEL` | Groq model identifier; defaults to `qwen/qwen3.8-27b`. |
| `ALLOWED_ORIGINS` | JSON array of exact HTTP(S) frontend origins; wildcards and paths are rejected. |
| `MAX_REQUEST_BYTES`, `API_REQUESTS_PER_MINUTE` | Request-body and per-client abuse limits; defaults 6 MiB and 240/minute. |
| `VITE_API_BASE_URL` | API origin or relative base; empty uses the same origin and Vite's local `/api` proxy. |

Vendor discovery builds a URL in your browser from the selected service, event type, location and optional keyword. Click Find, then Search on Google Maps to open Google Maps externally. No search API is called and no listings, ratings or availability are imported. Add a vendor and their written offer in Quotes, then select the finalized quote for an event in Plan A or B. Template briefs and interview questions remain available.

Maps URLs require no Google key: `api=1` is the URL protocol version. See [Google’s official documentation](https://developers.google.com/maps/documentation/urls/get-started). No feature in this app now requires Maps/Places billing.


## Formatting

`.editorconfig` defines UTF-8, LF and indentation. Run `python -m ruff format backend/app` for Python; `scripts/check.py` enforces it. Frontend `.prettierrc.json` supports Prettier-enabled editors. Prettier is not added as a project dependency; lint, types, unused-code checks and coverage remain mandatory.
