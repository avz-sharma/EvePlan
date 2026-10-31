# Deployment notes

## API service

The root `Dockerfile` builds the FastAPI service without changing backend application files. Build it from the repository root and deploy the image to Cloud Run. The container listens on the platform-provided `PORT` (8080 by default).

Set these runtime variables in the service configuration:

- `ALLOWED_ORIGINS`: a JSON array containing the static frontend origin.
- `GEMINI_API_KEY`: optional; omit it to use the backend's deterministic fallback.
- `GEMINI_MODEL`: optional; use the configured free-tier model default unless the deployment has a reason to override it.

Do not put secrets in the image or frontend build variables.

## Static frontend

Configure a static frontend host with:

- Project directory: `frontend`
- Build command: `pnpm install --frozen-lockfile && pnpm run build`
- Publish directory: `dist`
- Build variable: `VITE_API_BASE_URL` set to the deployed API origin, with no `/api` suffix

For local development, leave `VITE_API_BASE_URL` empty; Vite proxies `/api` to `127.0.0.1:8000`.

## Release record

No service has been deployed from this workspace. Add the actual frontend and API URLs to the README after a deployment owner publishes them; this repository does not contain a live URL yet.
