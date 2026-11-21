from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .admin import router as admin_router
from .auth import router as auth_router
from .config import Settings
from .dashboard import router as dashboard_router
from .errors import validation_error
from .issues import router as issues_router
from .notifications import router as notifications_router
from .validation import validation_fields


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    engine = create_engine(settings.database_url, pool_pre_ping=True)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(
        title="测试协作平台 API",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.session_factory = sessionmaker(engine, expire_on_commit=False)
    app.include_router(auth_router)
    app.include_router(admin_router)
    app.include_router(issues_router)
    app.include_router(notifications_router)
    app.include_router(dashboard_router)

    @app.middleware("http")
    async def protect_private_requests(request: Request, call_next):
        if not (
            request.url.path in {"/api/issues", "/api/notifications", "/api/dashboard"}
            or request.url.path.startswith(("/api/auth/", "/api/admin/", "/api/issues/", "/api/notifications/"))
        ):
            return await call_next(request)
        if (
            request.method in {"POST", "PATCH", "PUT", "DELETE"}
            and request.headers.get("sec-fetch-site") in {"cross-site", "same-site"}
        ):
            return JSONResponse(
                status_code=403, content={"detail": {"code": "untrusted_origin", "message": "请求来源无效"}},
            )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError):
        error = validation_error(validation_fields(exc.errors()))
        return JSONResponse(status_code=error.status_code, content={"detail": error.detail})

    return app


app = create_app()
