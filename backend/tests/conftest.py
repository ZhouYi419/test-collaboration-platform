import os
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.engine import URL, make_url
from sqlalchemy.schema import CreateSchema, DropSchema

from app.main import create_app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def database_url(tmp_path):
    postgres_url = os.getenv("TEST_DATABASE_URL")
    if not postgres_url:
        yield URL.create("sqlite", database=str(tmp_path / "app.db"))
        return
    url = make_url(postgres_url)
    schema = f"test_{uuid4().hex}"
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
