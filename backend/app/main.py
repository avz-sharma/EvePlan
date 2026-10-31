from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import onboarding_router, replan_router, vendor_router, vendor_search_router


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    with httpx.Client(timeout=8.0, limits=httpx.Limits(
        max_connections=20, max_keepalive_connections=10,
    )) as client:
        application.state.places_client = client
        yield


app = FastAPI(
    title="Celebration & Event Planner API",
    description="Data-driven event planning and vendor coordination API",
    version="2.0.0",
    lifespan=lifespan,
)

# Locked-down CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Attach Routers
app.include_router(onboarding_router)
app.include_router(replan_router)
app.include_router(vendor_router)
app.include_router(vendor_search_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "celebration-planner-engine"}

