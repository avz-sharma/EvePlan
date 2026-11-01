# Deployment


Build and check the API image:

```text
docker build -t eveplan-api .
docker run --rm -p 8080:8080 eveplan-api
```

The image builds wheels from the hashed runtime lockfile, runs as UID 10001, and exposes `/health`. For Cloud Run, create a local `deploy.env.yaml` with non-secret configuration such as:

```yaml
ALLOWED_ORIGINS: '["https://your-site.example"]'
APP_ORIGIN: 'https://your-site.example'
AUTH_REQUIRED: 'true'
```

```text
gcloud run deploy eveplan-api --source . --region asia-south1 --allow-unauthenticated --min-instances 0 --max-instances 1 --concurrency 8 --timeout 300 --cpu 1 --memory 512Mi --env-vars-file deploy.env.yaml
```

Use Secret Manager references for optional server keys. Build the frontend with its API base, then publish `frontend/dist` on a static host that supports `_headers` (for example Netlify or Cloudflare Pages). Other hosts must apply the generated headers themselves. The build emits CSP and security headers, adds the configured API origin to `connect-src`, and gives hashed assets/fonts a one-year immutable cache policy. HTML revalidates. Vercel enforces Google sign-in before celebration setup and stays locked when server credentials are missing.

For the same-origin Vercel setup and required server variables, see [Google sign-in](auth.md). Keep the root Node pin and Python requirements: Vercel uses them.

For a static frontend with Cloud Run, proxy `/api/*` under the frontend origin and leave `VITE_API_BASE_URL` empty for that layout. OAuth callbacks and the browser's session requests rely on same-origin cookies; a separate API base alone does not provide that routing. Configure the Google OAuth credentials and signing secret on the API, with the callback registered under the frontend origin. Vercel's committed routing already supplies this same-origin arrangement.
