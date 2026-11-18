import asyncio
import json
import time
from uuid import uuid4

import pytest

from app.auth import cookie_name, digest_token
from app.models import LoginSession, User

pytestmark = pytest.mark.anyio
BUG = {
    "type": "bug", "priority": "P1", "title": "导出失败", "description": "筛选后导出空文件",
    "environment": "uat", "severity": "严重", "steps": "选择筛选条件后导出", "actual": "空文件", "expected": "有结果",
}
REQUEST = {
    "type": "request", "priority": "P3", "title": "增加复制入口", "description": "可复制用例编号",
    "background": "重复引用用例", "outcome": "可复制编号", "acceptance": "粘贴后得到相同编号",
}


def session(app, role="tester"):
    token = uuid4().hex
    with app.state.session_factory() as db:
        user = User(
            username=token, username_key=token, email=f"{token}@example.test",
            password_hash="fixture", status="active", role=role,
        )
        db.add(user)
        db.flush()
        db.add(LoginSession(user_id=user.id, token_digest=digest_token(token), expires_at=int(time.time()) + 3600))
        db.commit()
    return {"Cookie": f"{cookie_name}={token}"}


async def write(client, headers, path, *, form=None, files=(), keep=(), version=None, submit=False, write_id=None,
                assignee_id=None):
    payload = {
        "write_id": str(write_id or uuid4()), "version": version, "submit": submit,
        "form": form or {}, "keep_attachments": list(keep),
        "assignee_id": assignee_id,
    }
    return await client.put(path, headers=headers, files=[
        ("data", (None, json.dumps(payload))), *(("files", (name, data)) for name, data in files),
    ])


async def test_issue_draft_and_submit_preserve_transaction_and_download(app, client):
    owner = session(app)
    path = f"/api/issues/{uuid4()}"
    draft = await write(client, owner, path, form={"title": "  暂存  "}, files=[("运行.log", b"line 1")])
    assert draft.status_code == 200, draft.text
    draft = draft.json()
    assert draft["title"] == "暂存" and draft["status"] == "draft"
    old_file = draft["attachments"][0]["id"]
    response = await write(
        client, owner, path, form={**BUG, "environment": None}, submit=True, version=draft["version"],
    )
    assert response.status_code == 422 and "environment" in response.json()["detail"]["fields"]
    assert (await client.get(path, headers=owner)).json() == draft
    mutation = uuid4()
    final = await write(
        client, owner, path, form=BUG, submit=True, version=draft["version"], write_id=mutation,
        files=[("报告.txt", b"new content")],
    )
    assert final.status_code == 200, final.text
    final = final.json()
    assert final["status"] == "pending_claim"
    assert final["form"]["environment"] == "uat"
    assert [attachment["name"] for attachment in final["attachments"]] == ["报告.txt"]
    new_file = final["attachments"][0]["id"]
    assert (await client.get(f"{path}/attachments/{old_file}", headers=owner)).status_code == 404
    download = await client.get(f"{path}/attachments/{new_file}", headers=owner)
    assert download.headers["cache-control"] == "no-store"
    assert "filename*=UTF-8" in download.headers["content-disposition"]
    assert download.content == b"new content"
    replay = await write(
        client, owner, path, form=BUG, submit=True, version=draft["version"], write_id=mutation,
        files=[("报告.txt", b"new content")],
    )
    assert replay.json() == final
    assert (await write(client, owner, path, version=final["version"])).status_code == 409
    assert (await client.delete(f"{path}?version={final['version']}", headers=owner)).status_code == 409


async def test_request_requires_its_fields_and_valid_enums(app, client):
    owner = session(app)
    path = f"/api/issues/{uuid4()}"
    for change, field in [({"priority": "high"}, "priority"), ({"environment": "local"}, "environment")]:
        response = await write(client, owner, path, form={**REQUEST, **change})
        assert response.status_code == 422
        assert field in response.json()["detail"]["fields"]
    incomplete = await write(client, owner, path, form={**REQUEST, "acceptance": " "}, submit=True)
    assert incomplete.json()["detail"]["fields"] == {"acceptance": "请填写验收标准"}
    full = await write(
        client, owner, path, form={**REQUEST, "due": "2026-12-01", "environment": "dev"}, submit=True,
    )
    assert full.status_code == 200, full.text
    assert full.json()["form"]["environment"] is None
    assert full.json()["form"]["due"] == "2026-12-01"
    assert len((await client.get("/api/issues", headers=owner)).json()) == 1


async def test_issue_and_attachment_permissions_are_owner_scoped(app, client):
    owner = session(app)
    other = session(app)
    path = f"/api/issues/{uuid4()}"
    response = await write(client, owner, path, files=[("owner.txt", b"only owner")])
    assert response.status_code == 200, response.text
    file_id = response.json()["attachments"][0]["id"]
    assert (await client.get("/api/issues")).status_code == 401
    assert (await write(client, {}, path)).status_code == 401
    for role in ["developer", "admin", None]:
        unauthorized = session(app, role)
        assert (await client.get("/api/issues", headers=unauthorized)).status_code == 403
        assert (await write(client, unauthorized, path)).status_code == 403
        expected = 404 if role == "developer" else 403
        assert (await client.get(f"{path}/attachments/{file_id}", headers=unauthorized)).status_code == expected
    assert (await client.get("/api/issues", headers=other)).json() == []
    assert (await client.get(path, headers=other)).status_code == 404
    assert (await client.get(f"{path}/attachments/{file_id}", headers=other)).status_code == 404
    assert (await write(client, other, path, version=1)).status_code == 404
    assert (await client.delete(f"{path}?version=1", headers=other)).status_code == 404
    cross_site = {**owner, "Sec-Fetch-Site": "cross-site"}
    assert (await client.delete(f"{path}?version=1", headers=cross_site)).status_code == 403
    assert (await client.delete(f"{path}?version=1", headers=owner)).status_code == 204
    assert (await client.get(f"{path}/attachments/{file_id}", headers=owner)).status_code == 404


async def test_attachment_limits_and_failed_edit_keep_original_draft(app, client):
    owner = session(app)
    path = f"/api/issues/{uuid4()}"
    original = await write(client, owner, path, files=[("边界.txt", b"a" * 10_000_000)])
    assert original.status_code == 200, original.text
    draft = original.json()
    first = draft["attachments"][0]["id"]
    bad_uploads = [
        [("bad.exe", b"ignored")], [("bad.png", b"not png")], [("bad.log", b"\x00binary")],
        [("oversize.txt", b"a" * 10_000_001)],
        [(f"{index}.txt", b"file") for index in range(5)],
    ]
    for files in bad_uploads:
        rejected = await write(client, owner, path, files=files, keep=[first], version=1)
        assert rejected.status_code == 422, rejected.text
        assert "attachments" in rejected.json()["detail"]["fields"]
    invalid_keep = await write(client, owner, path, files=[("valid.log", b"log")], keep=[first + 1], version=1)
    assert invalid_keep.status_code == 422
    assert (await client.get(path, headers=owner)).json() == draft


async def test_idempotent_create_and_concurrent_draft_submission(app, client):
    owner = session(app)
    path = f"/api/issues/{uuid4()}"
    mutation = uuid4()
    first, second = await asyncio.gather(
        write(client, owner, path, write_id=mutation), write(client, owner, path, write_id=mutation),
    )
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    responses = await asyncio.gather(
        write(client, owner, path, form=BUG, version=1, submit=True),
        write(client, owner, path, form=REQUEST, version=1, submit=True),
    )
    assert sorted(response.status_code for response in responses) == [200, 409]
    assert len((await client.get("/api/issues", headers=owner)).json()) == 1
