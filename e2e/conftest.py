import os
import re
import secrets
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session

from app.auth import password_hash
from app.models import User
from issue_steps import Site

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VITE = FRONTEND / "node_modules" / "vite" / "bin" / "vite.js"


@contextmanager
def running_server(command, *, cwd, env, log):
    with log.open("wb") as output:
        process = subprocess.Popen(command, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT)
    try:
        deadline = time.monotonic() + 20
        while process.poll() is None and time.monotonic() < deadline:
            contents = log.read_text(encoding="utf-8", errors="replace")
            address = re.search(r"http://127\.0\.0\.1:(\d+)/?", contents)
            if address:
                break
            time.sleep(0.1)
        else:
            contents = log.read_text(encoding="utf-8", errors="replace")
            raise RuntimeError(f"{log.name} 未在限定时间内启动：\n{contents}")
        yield f"http://127.0.0.1:{address[1]}"
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {
        **browser_context_args,
        "viewport": {"width": 1440, "height": 900},
        "locale": "zh-CN",
        "timezone_id": "Asia/Shanghai",
        "reduced_motion": "reduce",
    }


@pytest.fixture(scope="session", autouse=True)
def browser_metadata(record_testsuite_property, browser, browser_name, browser_channel):
    record_testsuite_property("browser", browser_channel or browser_name)
    record_testsuite_property("browser_version", browser.version)


@pytest.fixture
def live_site(tmp_path):
    if not VITE.is_file():
        pytest.fail("缺少 Vite，请先在 frontend 目录安装锁定的依赖。")
    database = URL.create("sqlite", database=str(tmp_path / "e2e.db"))
    env = {
        **os.environ,
        "DATABASE_URL": database.render_as_string(),
        "SERVER_OPERATOR_USER_IDS": "",
        "SECURE_COOKIE": "0",
        "NO_COLOR": "1",
    }
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND, env=env, check=True)
    password = secrets.token_urlsafe(18)
    digest = password_hash.hash(password)
    engine = create_engine(database)
    try:
        with Session(engine) as db:
            for role in ("tester", "developer"):
                username = f"e2e-{role}"
                db.add(User(
                    username=username, username_key=username, email=f"{username}@example.test",
                    password_hash=digest, role=role, status="active",
                ))
            db.commit()
    finally:
        engine.dispose()

    # 端口由操作系统分配。Vite 只代理到本用例启动的 API。
    api_command = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "0"]
    web_command = ["node", str(VITE), "--host", "127.0.0.1", "--port", "0", "--strictPort"]
    with running_server(api_command, cwd=BACKEND, env=env, log=tmp_path / "api.log") as api_url:
        web_env = {**env, "API_PROXY_TARGET": api_url}
        with running_server(web_command, cwd=FRONTEND, env=web_env, log=tmp_path / "web.log") as url:
            yield Site(url, password)
