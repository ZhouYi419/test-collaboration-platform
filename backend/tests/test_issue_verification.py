import asyncio
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event, select

from app.models import IssueVerification, User
from test_issue_workflow import act, user_id
from test_issues import BUG, REQUEST, session, write

pytestmark = pytest.mark.anyio


async def verify(client, headers, issue, outcome, *, reason=None, write_id=None):
    return await client.post(f"/api/issues/{issue['id']}/verification", headers=headers, json={
        "outcome": outcome, "version": issue["version"],
        "write_id": str(write_id or uuid4()), "reason": reason,
    })


async def submit_and_finish(app, client, tester, developer, form):
    created = await write(
        client, tester, f"/api/issues/{uuid4()}", form=form, submit=True,
        assignee_id=user_id(app, developer), files=[("trace.log", b"case evidence")],
    )
    assert created.status_code == 200, created.text
    started = await act(client, developer, created.json(), "start")
    assert started.status_code == 200, started.text
    finished = await act(client, developer, started.json(), "finish", feedback="初次处理说明")
    assert finished.status_code == 200, finished.text
    issue = finished.json()
    assert issue["latest_verification"] is None
    return issue


def records(app, issue):
    with app.state.session_factory() as db:
        return list(db.scalars(select(IssueVerification)
                    .where(IssueVerification.issue_id == UUID(issue["id"]))
                    .order_by(IssueVerification.issue_version)))


@pytest.mark.parametrize(("form", "returns"), [(BUG, 0), (REQUEST, 2)])
async def test_verify_close_and_repeat_rework(app, client, form, returns):
    tester = session(app)
    developer = session(app, "developer")
    issue = await submit_and_finish(app, client, tester, developer, form)
    path = f"/api/issues/{issue['id']}"
    history = []
    for round_number in range(1, returns + 1):
        reason = f"第 {round_number} 次退回原因"
        history.append((issue["version"], "returned", reason, issue["feedback"], issue["feedback_at"]))
        write_id = uuid4()
        result = await verify(client, tester, issue, "returned", reason=f"  {reason}  ", write_id=write_id)
        assert result.status_code == 200, result.text
        returned = result.json()
        assert returned["status"] == "in_progress" and returned["assignee"] == issue["assignee"]
        assert returned["version"] == issue["version"] + 1 and returned["feedback"] == issue["feedback"]
        assert returned["latest_verification"]["reason"] == reason
        assert (await verify(client, tester, issue, "returned", reason=reason, write_id=write_id)).json() == returned
        assert (await verify(client, tester, returned, "passed")).status_code == 409
        assert (await act(client, developer, returned, "start")).status_code == 409
        assert (await client.get(path, headers=developer)).json() == returned
        queue = (await client.get("/api/issues/development?queue=assigned", headers=developer)).json()
        assert [(item["id"], item["status"]) for item in queue] == [(issue["id"], "in_progress")]
        assert (await client.get("/api/issues/development?queue=feedback", headers=developer)).json() == []
        updated = await act(client, developer, returned, "finish", feedback=f"第 {round_number} 次重新处理")
        assert updated.status_code == 200, updated.text
        fresh = updated.json()
        assert fresh["status"] == "pending_verify" and fresh["feedback"] != issue["feedback"]
        assert fresh["latest_verification"] == returned["latest_verification"]
        assert (await verify(client, tester, issue, "passed")).status_code == 409
        assert (await verify(client, tester, issue, "returned", reason=reason, write_id=write_id)).json() == fresh
        issue = fresh

    history.append((issue["version"], "passed", None, issue["feedback"], issue["feedback_at"]))
    closed_response = await verify(client, tester, issue, "passed")
    assert closed_response.status_code == 200, closed_response.text
    closed = closed_response.json()
    assert closed["status"] == "closed" and closed["version"] == issue["version"] + 1
    result = closed["latest_verification"]
    assert result["outcome"] == "passed" and result["reason"] is None
    assert result["tester"]["id"] == user_id(app, tester) and result["verified_at"] == closed["updated_at"]
    for account in (tester, developer):
        assert (await client.get(path, headers=account)).json() == closed
    queue = (await client.get("/api/issues/development?queue=feedback", headers=developer)).json()
    assert [(item["id"], item["status"]) for item in queue] == [(issue["id"], "closed")]
    assert (await client.get("/api/issues", headers=tester)).json()[0]["status"] == "closed"
    assert (await act(client, developer, closed, "finish", feedback="无效更新")).status_code == 409
    assert (await verify(client, tester, closed, "returned", reason="无效退回")).status_code == 409
    assert [(row.issue_version, row.outcome, row.reason, row.feedback, row.feedback_at)
            for row in records(app, issue)] == history


async def test_verification_validation_roles_and_privacy(app, client):
    tester = session(app)
    developer = session(app, "developer")
    other_tester = session(app)
    other_developer = session(app, "developer")
    issue = await submit_and_finish(app, client, tester, developer, BUG)
    path = f"/api/issues/{issue['id']}"
    for account, status in [({}, 401), (developer, 403), (session(app, "admin"), 403), (other_tester, 404)]:
        response = await verify(client, account, issue, "returned", reason="私有原因")
        assert response.status_code == status and set(response.json()) == {"detail"}
    cross_site = {**tester, "Sec-Fetch-Site": "cross-site"}
    assert (await verify(client, cross_site, issue, "passed")).status_code == 403
    for outcome, reason in [("returned", None), ("returned", "   "), ("returned", "文" * 5001),
                            ("returned", "错误\x00"), ("passed", "无效原因")]:
        response = await verify(client, tester, issue, outcome, reason=reason)
        assert response.status_code == 422 and "reason" in response.json()["detail"]["fields"]
    assert (await client.get(path, headers=tester)).json() == issue

    returned = (await verify(client, tester, issue, "returned", reason="字" * 5000)).json()
    for account in (other_tester, other_developer):
        assert (await client.get(path, headers=account)).status_code == 404
        assert (await client.get(f"{path}/attachments/{issue['attachments'][0]['id']}",
                                 headers=account)).status_code == 404
    assert (await act(client, other_developer, returned, "finish", feedback="越权")).status_code == 404
    with app.state.session_factory() as db:
        db.get(User, user_id(app, tester)).status = "disabled"
        db.commit()
    assert (await verify(client, tester, returned, "passed")).status_code == 401


@pytest.mark.parametrize("same_request", [False, True])
async def test_concurrent_verification_writes_one_record(app, client, same_request):
    tester = session(app)
    developer = session(app, "developer")
    issue = await submit_and_finish(app, client, tester, developer, REQUEST)
    write_id = uuid4()
    other = verify(client, tester, issue, "passed", write_id=write_id) if same_request else verify(
        client, tester, issue, "returned", reason="还未修复",
    )
    replies = await asyncio.gather(verify(client, tester, issue, "passed", write_id=write_id), other)
    assert sorted(reply.status_code for reply in replies) == ([200, 200] if same_request else [200, 409])
    winner = next(reply.json() for reply in replies if reply.status_code == 200)
    if same_request:
        assert replies[1].json() == winner
    assert winner["version"] == issue["version"] + 1
    history = records(app, issue)
    assert len(history) == 1 and history[0].outcome == winner["latest_verification"]["outcome"]
    if winner["status"] == "closed":
        changed_replay = await verify(client, tester, issue, "returned", reason="变更同一请求", write_id=write_id)
        assert changed_replay.status_code == 409


async def test_verification_failure_rolls_back_issue_and_record(app, client):
    tester = session(app)
    developer = session(app, "developer")
    issue = await submit_and_finish(app, client, tester, developer, BUG)

    def fail_record(mapper, connection, target):
        raise RuntimeError("模拟验证记录写入失败")

    event.listen(IssueVerification, "before_insert", fail_record)
    try:
        with pytest.raises(RuntimeError, match="模拟验证记录写入失败"):
            await verify(client, tester, issue, "passed")
    finally:
        event.remove(IssueVerification, "before_insert", fail_record)
    assert (await client.get(f"/api/issues/{issue['id']}", headers=tester)).json() == issue
    assert records(app, issue) == []
    assert (await verify(client, tester, issue, "passed")).status_code == 200
