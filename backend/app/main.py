"""FastAPI composition for authentication, request guards and planning routes."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api_docs import configure_docs
from .config import settings
from .middleware.auth import AuthenticationGate
from .middleware.compression import CompressionMiddleware
from .middleware.security import SecurityMiddleware
from .routers import onboarding_router, replan_router, vendor_router, vendor_search_router
from .routers.auth_router import router as auth_router

app = FastAPI(
    title="Celebration & Event Planner API",
    description="Data-driven event planning and vendor coordination API",
    version="2.0.0",
    docs_url=None,
    redoc_url=None,
)

app.add_middleware(AuthenticationGate)
app.include_router(auth_router)

# Locked-down CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.add_middleware(CompressionMiddleware)
app.add_middleware(
    SecurityMiddleware,
    max_body_bytes=settings.MAX_REQUEST_BYTES,
    requests_per_minute=settings.API_REQUESTS_PER_MINUTE,
)

# Attach Routers
app.include_router(onboarding_router)
app.include_router(replan_router)
app.include_router(vendor_router)
app.include_router(vendor_search_router)
configure_docs(app)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Return an inexpensive health response without authentication or provider calls."""
    return {"status": "ok", "service": "celebration-planner-engine"}
