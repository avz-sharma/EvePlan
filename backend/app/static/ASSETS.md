# Vendored API documentation assets

- `docs/`: Swagger UI 5.34.0 from the `swagger-ui-dist` npm package. Apache-2.0 license, NOTICE, and bundled dependency notices are alongside the assets.
- `redoc/`: ReDoc 2.1.5 from `https://cdn.jsdelivr.net/npm/redoc@2.1.5/`. The MIT license is alongside the standalone bundle.
- `docs/swagger-init.js`: EvePlan's initializer, served separately to avoid inline scripts under the app CSP.

These assets load only when the API documentation is opened. They are excluded from application TypeScript lint and bundle measurements. Upgrade vendored assets deliberately with their license notices.
