from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .auth import router
from .config import Settings

field_names = {
    "identifier": "用户名或邮箱",
    "username": "用户名",
    "email": "邮箱",
    "password": "密码",
    "confirm_password": "确认密码",
}


def validation_message(error: dict, field: str) -> str:
    if error["type"] == "invalid_input":
        return error["msg"]
    if field == "password":
        if error["type"] == "string_too_short":
            if error["ctx"]["min_length"] == 8 and error.get("input") != "":
                return "密码至少 8 位"
            return "请输入密码"
        if error["type"] == "string_too_long":
            return "密码最多 128 位"
    return f"请填写有效的{field_names[field]}"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    engine = create_engine(settings.database_url, pool_pre_ping=True)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
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
    app.include_router(router)

    @app.middleware("http")
    async def protect_auth_requests(request: Request, call_next):
        if not request.url.path.startswith("/api/auth/"):
            return await call_next(request)
        if request.method == "POST" and request.headers.get("sec-fetch-site") in {"cross-site", "same-site"}:
            return JSONResponse(
                status_code=403, content={"detail": {"code": "untrusted_origin", "message": "请求来源无效"}},
            )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError):
        fields = {}
        for error in exc.errors():
            field = error["loc"][-1]
            if field in field_names:
                fields[field] = validation_message(error, field)
        return JSONResponse(status_code=422, content={
            "detail": {"code": "validation_error", "message": "请检查表单输入", "fields": fields},
        })

    return app


app = create_app()
