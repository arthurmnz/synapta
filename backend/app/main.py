from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import APIError, api_error_handler
from app.db.seed import seed_database
from app.db.session import SessionLocal


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Run optional idempotent startup tasks such as seeding demo data."""
    if settings.SEED_ON_START:
        with SessionLocal() as db:
            seed_database(db)
    yield


def create_app() -> FastAPI:
    """Construct and configure the Synapta FastAPI application."""
    application = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )

    application.add_exception_handler(APIError, api_error_handler)
    application.include_router(api_router, prefix=settings.API_V1_PREFIX)
    return application


app = create_app()
