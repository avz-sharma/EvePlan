"""Self-host API documentation without an inline JavaScript initializer."""

import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles


def configure_docs(app: FastAPI) -> None:
    directory = Path(__file__).resolve().parent / "static"
    app.mount("/static", StaticFiles(directory=directory), name="documentation-assets")

    @app.get("/docs", include_in_schema=False)
    async def swagger() -> HTMLResponse:
        page = get_swagger_ui_html(
            openapi_url="/openapi.json", title=f"{app.title} — API docs",
            swagger_js_url="/static/docs/swagger-ui-bundle.js",
            swagger_css_url="/static/docs/swagger-ui.css",
            swagger_favicon_url="/static/docs/favicon-32x32.png",
        )
        html = re.sub(r"<script>.*?</script>", '<script src="/static/docs/swagger-init.js"></script>',
                      bytes(page.body).decode(), flags=re.DOTALL)
        return HTMLResponse(html)

    @app.get("/redoc", include_in_schema=False)
    async def redoc() -> HTMLResponse:
        return get_redoc_html(openapi_url="/openapi.json", title=f"{app.title} — ReDoc",
                              redoc_js_url="/static/redoc/redoc.standalone.js",
                              redoc_favicon_url="/static/docs/favicon-32x32.png", with_google_fonts=False)
