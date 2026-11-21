import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.auth import digest_token
from app.models import LoginSession, User
from test_issues import BUG, session, write

pytestmark = pytest.mark.anyio


def user_id(app, headers):
    token = headers["Cookie"].split("=", 1)[1]
    with app.state.session_factory() as db:
        return db.scalar(select(LoginSession.user_id).where(LoginSession.token_digest == digest_token(token)))


async def act(client, headers, issue, action, *, version=None, write_id=None, feedback=None):
    return await client.post(f"/api/issues/{issue['id']}/actions", headers=headers, json={
        "action": action, "version": version or issue["version"],
        "write_id": str(write_id or uuid4()), "feedback": feedback,
    })


@pytest.mark.parametrize("assigned", [False, True])
async def test_developer_flow_and_read_permissions(app, client, assigned):
    owner = session(app)
    other_tester = session(app)
    developer = session(app, "developer")
    outsider = session(app, "developer")
    developer_id = user_id(app, developer)
    path = f"/api/issues/{uuid4()}"
    created = await write(
        client, owner, path, form=BUG, submit=True, assignee_id=developer_id if assigned else None,
        files=[("trace.log", b"case evidence")],
    )
    assert created.status_code == 200, created.text
    issue = created.json()
    attachment_path = f"{path}/attachments/{issue['attachments'][0]['id']}"
    if not assigned:
        assert (await client.get(path, headers=outsider)).status_code == 200
        assert (await client.get(attachment_path, headers=outsider)).content == b"case evidence"
        assert (await act(client, developer, issue, "start")).status_code == 409
        mutation = uuid4()
        claimed = await act(client, developer, issue, "claim", write_id=mutation)
        assert claimed.status_code == 200, claimed.text
        assert (await act(client, developer, issue, "claim", write_id=mutation)).json() == claimed.json()
        issue = claimed.json()
    assert issue["assignee"]["id"] == developer_id and issue["status"] == "pending_work"
    for account in (outsider, other_tester):
        assert (await client.get(path, headers=account)).status_code == 404
        assert (await client.get(attachment_path, headers=account)).status_code == 404
        assert (await act(client, account, issue, "start")).status_code in {403, 404}
    assert (await act(client, developer, issue, "finish", feedback="skip")).status_code == 409
    assert [item["id"] for item in (await client.get("/api/issues/development?queue=assigned", headers=developer)).json()["items"]] == [issue["id"]]
    assert (await client.get("/api/issues/development", headers=developer)).json()["items"] == []
    assert (await client.get("/api/issues/development?queue=assigned", headers=outsider)).json()["items"] == []
    started = await act(client, developer, issue, "start")
    assert started.status_code == 200, started.text
    assert (await act(client, developer, issue, "start")).status_code == 409
    issue = started.json()
    assert issue["status"] == "in_progress"
    for feedback in [None, "   ", "a" * 5001, "bad\x00text"]:
        invalid = await act(client, developer, issue, "finish", feedback=feedback)
        assert invalid.status_code == 422, invalid.text
        assert "feedback" in invalid.json()["detail"]["fields"]
    assert (await client.get(path, headers=owner)).json() == issue
    mutation = uuid4()
    finished = await act(client, developer, issue, "finish", write_id=mutation, feedback="  已修复，等待复测。  ")
    assert finished.status_code == 200, finished.text
    result = finished.json()
    assert result["status"] == "pending_verify" and result["feedback"] == "已修复，等待复测。"
    assert result["feedback_at"] and result["creator"]["id"] == user_id(app, owner)
    assert (await act(client, developer, issue, "finish", write_id=mutation, feedback="已修复，等待复测。")).json() == result
    assert (await client.get(path, headers=owner)).json() == result
    assert (await client.get(attachment_path, headers=developer)).status_code == 200
    assert (await client.get("/api/issues/development?queue=assigned", headers=developer)).json()["items"] == []
    assert (await client.get("/api/issues/development?queue=feedback", headers=developer)).json()["items"][0]["id"] == issue["id"]


async def test_assignment_revalidation_and_role_changes(app, client):
    owner = session(app)
    developer = session(app, "developer")
    developer_id = user_id(app, developer)
    other = session(app, "tester")
    path = f"/api/issues/{uuid4()}"
    original = await write(client, owner, path, form=BUG, assignee_id=developer_id)
    assert original.status_code == 200, original.text
    draft = original.json()
    assert draft["assignee"]["id"] == developer_id
    assert (await client.get(path, headers=developer)).status_code == 404
    assert (await act(client, developer, draft, "claim")).status_code == 404
    assert (await client.get("/api/issues/developers", headers=owner)).json() == [
        {"id": developer_id, "username": draft["assignee"]["username"]},
    ]
    for role, status in [("developer", "disabled"), ("tester", "active")]:
        with app.state.session_factory() as db:
            account = db.get(User, developer_id)
            account.role, account.status = role, status
            db.commit()
        invalid = await write(client, owner, path, form=BUG, submit=True, version=draft["version"], assignee_id=developer_id)
        assert invalid.status_code == 422
        assert "assignee_id" in invalid.json()["detail"]["fields"]
        assert (await client.get(path, headers=owner)).json() == draft
        assert (await client.get("/api/issues/developers", headers=owner)).json() == []
    for target in [user_id(app, other), developer_id + 1000]:
        assert (await write(client, owner, path, assignee_id=target, version=draft["version"])).status_code == 422
    with app.state.session_factory() as db:
        db.get(User, developer_id).role = "developer"
        db.commit()
    submitted = await write(client, owner, path, form=BUG, submit=True, version=draft["version"], assignee_id=developer_id)
    assert submitted.status_code == 200
    issue = submitted.json()
    with app.state.session_factory() as db:
        db.get(User, developer_id).role = "tester"
        db.commit()
    assert (await act(client, developer, issue, "start")).status_code == 403
    assert (await client.get(path, headers=developer)).status_code == 404
    assert (await client.get(path, headers=owner)).json()["assignee"]["id"] == developer_id


async def test_simultaneous_claims_have_single_owner_and_private_result(app, client):
    owner = session(app)
    developers = [session(app, "developer"), session(app, "developer")]
    path = f"/api/issues/{uuid4()}"
    issue = (await write(client, owner, path, form=BUG, submit=True)).json()
    replies = await asyncio.gather(*(act(client, account, issue, "claim") for account in developers))
    assert sorted(reply.status_code for reply in replies) == [200, 409]
    winner = next(index for index, reply in enumerate(replies) if reply.status_code == 200)
    result = replies[winner].json()
    assert result["assignee"]["id"] == user_id(app, developers[winner])
    rejected = replies[1-winner].json()
    assert set(rejected) == {"detail"}
    assert rejected["detail"]["code"] == "claim_unavailable"
    assert (await client.get(path, headers=developers[1-winner])).status_code == 404
    assert (await client.get("/api/issues/development", headers=developers[1-winner])).json()["items"] == []


async def test_concurrent_replays_apply_each_action_once(app, client):
    owner = session(app)
    developer = session(app, "developer")
    path = f"/api/issues/{uuid4()}"
    issue = (await write(client, owner, path, form=BUG, submit=True)).json()
    for action in ("claim", "start", "finish"):
        mutation = uuid4()
        results = await asyncio.gather(*(
            act(client, developer, issue, action, write_id=mutation, feedback="处理说明")
            for _ in range(2)
        ))
        assert [result.status_code for result in results] == [200, 200]
        assert results[0].json() == results[1].json()
        updated = results[0].json()
        assert updated["version"] == issue["version"] + 1
        issue = updated


async def test_workflow_endpoints_require_roles_and_origin(app, client):
    owner = session(app)
    developer = session(app, "developer")
    admin = session(app, "admin")
    path = f"/api/issues/{uuid4()}"
    issue = (await write(client, owner, path, form=BUG, submit=True)).json()
    for headers, expected in [({}, 401), (owner, 403), (admin, 403)]:
        assert (await client.get("/api/issues/development", headers=headers)).status_code == expected
        assert (await act(client, headers, issue, "claim")).status_code == expected
    assert (await client.get("/api/issues/developers", headers=developer)).status_code == 403
    assert (await act(client, {**developer, "Sec-Fetch-Site": "cross-site"}, issue, "claim")).status_code == 403
    assert (await client.get(path, headers=owner)).json()["status"] == "pending_claim"
