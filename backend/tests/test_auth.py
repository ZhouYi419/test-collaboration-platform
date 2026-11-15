import asyncio
import os
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, update
from sqlalchemy.engine import URL, make_url
from sqlalchemy.schema import CreateSchema, DropSchema

from app.accounts import main as enable_account
from app.auth import cookie_name
from app.main import create_app
from app.models import LoginSession, User

registration_data = {
    "username": "T001-测试",
    "email": "t001@example.test",
    "password": "abcdefgh",
    "confirm_password": "abcdefgh",
}
pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def database_url(tmp_path):
    postgres_url = os.getenv("TEST_DATABASE_URL")
    if not postgres_url:
        yield URL.create("sqlite", database=str(tmp_path / "auth.db"))
        return
    url = make_url(postgres_url)
    schema = f"t001_{uuid4().hex}"
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(CreateSchema(schema))
    try:
        yield url.update_query_dict({"options": f"-csearch_path={schema}"})
    finally:
        with engine.begin() as connection:
            connection.execute(DropSchema(schema, cascade=True))
        engine.dispose()


@pytest.fixture
def app(database_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", database_url.render_as_string(hide_password=False))
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    return create_app()


@pytest.fixture
async def client(app):
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as test_client:
            yield test_client


async def login(client, identifier, password=registration_data["password"]):
    return await client.post("/api/auth/login", json={"identifier": identifier, "password": password})


async def register(client, **changes):
    return await client.post("/api/auth/register", json={**registration_data, **changes})


async def test_registration_validates_fields_without_exposing_password(client):
    spec = (await client.get("/api/openapi.json")).json()
    validation = spec["paths"]["/api/auth/register"]["post"]["responses"]["422"]
    assert validation["content"]["application/json"]["schema"]["$ref"].endswith("/AuthErrorResponse")

    response = await client.post("/api/auth/register", json={})
    assert response.status_code == 422
    assert set(response.json()["detail"]["fields"]) == set(registration_data)

    response = await register(client, username="a@example.com", email="bad", password="short")
    assert response.status_code == 422
    assert set(response.json()["detail"]["fields"]) == {"username", "email", "password"}
    assert "short" not in response.text
    response = await register(client, confirm_password="another-password")
    assert response.json()["detail"]["fields"] == {"confirm_password": "两次输入的密码不一致"}


async def test_registration_persists_inactive_user_and_enforces_uniqueness(client, app):
    response = await register(client, username="  T001-测试  ", email="  T001@Example.TEST  ")
    assert response.status_code == 201
    assert response.json() == {"id": 1, "username": "T001-测试", "email": "t001@example.test"}
    assert cookie_name not in client.cookies
    with app.state.session_factory() as db:
        user = db.scalar(select(User))
        assert user.is_active is False
        assert user.password_hash.startswith("$argon2id$")

    duplicate_name = await register(client, username="t001-测试", email="other@example.test")
    duplicate_email = await register(client, username="other", email="T001@example.TEST")
    assert duplicate_name.status_code == duplicate_email.status_code == 409
    assert duplicate_name.json()["detail"]["code"] == "username_taken"
    assert duplicate_email.json()["detail"]["code"] == "email_taken"


async def test_concurrent_registration_for_the_same_username(client):
    responses = await asyncio.gather(
        register(client, email="t001-1@example.test"),
        register(client, email="t001-2@example.test"),
    )
    assert sorted(response.status_code for response in responses) == [201, 409]


async def test_activation_login_refresh_and_logout(client, monkeypatch):
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await register(client)).status_code == 201
    bad_password = await login(client, registration_data["username"], "not-the-password")
    unknown_user = await login(client, "unknown-user")
    assert bad_password.status_code == unknown_user.status_code == 401
    assert bad_password.json() == unknown_user.json()
    inactive = await login(client, "t001@EXAMPLE.TEST")
    assert inactive.status_code == 403
    assert inactive.json()["detail"]["message"] == "账号尚未启用，请联系管理员"

    monkeypatch.setattr("sys.argv", ["accounts", "enable", "t001-测试"])
    enable_account()
    enable_account()
    response = await login(client, "  t001-测试 ")
    assert response.status_code == 200
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "samesite=lax" in response.headers["set-cookie"].lower()
    first_token = client.cookies[cookie_name]
    current_user = await client.get("/api/auth/me")
    assert current_user.json() == response.json()
    assert current_user.headers["cache-control"] == "no-store"

    assert (await login(client, "T001@EXAMPLE.TEST")).status_code == 200
    second_token = client.cookies[cookie_name]
    assert first_token != second_token
    assert (await client.post("/api/auth/logout")).status_code == 204
    assert cookie_name not in client.cookies
    for token in (first_token, second_token):
        replay = await client.get("/api/auth/me", headers={"Cookie": f"{cookie_name}={token}"})
        assert replay.status_code == 401
    assert (await client.post("/api/auth/logout")).status_code == 204


async def test_expired_session_and_cross_site_mutation(client, app, monkeypatch):
    await register(client)
    monkeypatch.setattr("sys.argv", ["accounts", "enable", registration_data["username"]])
    enable_account()
    assert (await login(client, registration_data["username"])).status_code == 200
    blocked = await client.post("/api/auth/logout", headers={"Sec-Fetch-Site": "cross-site"})
    assert blocked.status_code == 403
    assert (await client.get("/api/auth/me")).status_code == 200
    with app.state.session_factory() as db:
        db.execute(update(LoginSession).values(expires_at=0))
        db.commit()
    assert (await client.get("/api/auth/me")).status_code == 401
