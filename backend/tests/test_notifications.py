import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import event, select

from app.models import Notification, User
from test_issue_verification import verify
from test_issue_workflow import act, user_id
from test_issues import BUG, session, write

pytestmark = pytest.mark.anyio
inbox = "/api/notifications"


async def entries(client, headers):
    response = await client.get(inbox, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["items"]


async def test_notifications_follow_actions_and_verification_rounds(app, client):
    tester = session(app)
    developer = session(app, "developer")
    assignee = user_id(app, developer)
    path = f"/api/issues/{uuid4()}"

    draft = (await write(client, tester, path, form=BUG, assignee_id=assignee)).json()
    assert await entries(client, developer) == []
    request = uuid4()
    responses = await asyncio.gather(*(
        write(client, tester, path, form=BUG, submit=True, assignee_id=assignee,
              version=draft["version"], write_id=request) for _ in range(2)
    ))
    assert all(response.status_code == 200 for response in responses)
    assert [item["event"] for item in await entries(client, developer)] == ["assigned"]
    assert await entries(client, tester) == []

    path = f"/api/issues/{uuid4()}"
    issue = (await write(client, tester, path, form=BUG, submit=True)).json()
    assert await entries(client, tester) == []
    assert (await act(client, developer, issue, "start")).status_code == 409
    request = uuid4()
    responses = await asyncio.gather(*(act(client, developer, issue, "claim", write_id=request) for _ in range(2)))
    assert all(response.status_code == 200 for response in responses)
    issue = responses[0].json()
    issue = (await act(client, developer, issue, "start")).json()
    assert (await act(client, developer, issue, "finish")).status_code == 422
    issue = (await act(client, developer, issue, "finish", feedback="等待验证")).json()
    request = uuid4()
    returned = await verify(client, tester, issue, "returned", reason="仍未修复", write_id=request)
    assert returned.status_code == 200
    assert (await verify(client, tester, issue, "returned", reason="仍未修复", write_id=request)).status_code == 200
    issue = (await act(client, developer, returned.json(), "finish", feedback="再次反馈")).json()
    assert (await verify(client, tester, issue, "passed")).status_code == 200

    assert [item["event"] for item in await entries(client, tester)] == ["feedback", "feedback", "started", "claimed"]
    assert [item["event"] for item in await entries(client, developer)] == ["passed", "returned", "assigned"]
    with app.state.session_factory() as db:
        assert len(db.scalars(select(Notification.id)).all()) == 7


async def test_notification_visibility_paging_and_idempotent_reads(app, client):
    tester = session(app)
    developer = session(app, "developer")
    outsider = session(app, "developer")
    admin = session(app, "admin")
    developer_id = user_id(app, developer)
    for idx in range(7):
        response = await write(client, tester, f"/api/issues/{uuid4()}", form={**BUG, "title": f"消息 {idx}"},
                               submit=True, assignee_id=developer_id)
        assert response.status_code == 200

    page = (await client.get(inbox, headers=developer)).json()
    assert len(page["items"]) == 6 and page["next_before"] == page["items"][-1]["id"]
    rest = (await client.get(inbox, headers=developer, params={"before": page["next_before"]})).json()
    assert [item["title"] for item in rest["items"]] == ["消息 0"] and rest["next_before"] is None
    unread = (await client.get(f"{inbox}/summary", headers=developer)).json()
    assert unread["unread_count"] == len(unread["recent"]) == 7
    assert await entries(client, outsider) == []
    assert (await client.get(inbox)).status_code == 401
    assert (await client.get(f"{inbox}/summary", headers=admin)).status_code == 403
    assert (await client.get(inbox, headers=outsider, params={"before": page["next_before"]})).status_code == 404

    newest = page["items"][0]
    path = f"{inbox}/{newest['id']}/read"
    body = {"issue_id": newest["issue_id"]}
    assert (await client.put(path, headers=outsider, json=body)).status_code == 404
    assert (await client.put(path, headers=developer, json={"issue_id": str(uuid4())})).status_code == 404
    assert (await client.put(path, headers={**developer, "Sec-Fetch-Site": "cross-site"}, json=body)).status_code == 403
    result = await client.put(path, headers=developer, json=body)
    assert result.status_code == 200
    assert (await client.put(path, headers=developer, json=body)).json() == result.json()
    assert (await client.get(f"{inbox}/summary", headers=developer)).json()["unread_count"] == 6

    with app.state.session_factory() as db:
        db.get(User, developer_id).role = "tester"
        db.commit()
    assert (await client.get(f"{inbox}/summary", headers=developer)).json()["unread_count"] == 0
    assert (await client.put(path, headers=developer, json=body)).status_code == 404
    assert (await client.put(f"{inbox}/read", headers=developer)).status_code == 204
    with app.state.session_factory() as db:
        db.get(User, developer_id).role = "developer"
        db.commit()
    assert (await client.get(f"{inbox}/summary", headers=developer)).json()["unread_count"] == 6
    assert (await client.put(f"{inbox}/read", headers=developer)).status_code == 204
    assert (await client.get(f"{inbox}/summary", headers=developer)).json()["unread_count"] == 0
    assert (await entries(client, developer))[0]["read_at"] == result.json()["read_at"]


async def test_notification_failure_rolls_back_issue_transition(app, client):
    tester = session(app)
    developer = session(app, "developer")
    path = f"/api/issues/{uuid4()}"
    issue = (await write(client, tester, path, form=BUG, submit=True)).json()

    def interrupt(db, *_):
        if any(isinstance(row, Notification) for row in db.new):
            raise RuntimeError("通知写入失败")

    sessions = app.state.session_factory
    event.listen(sessions, "before_flush", interrupt)
    try:
        with pytest.raises(RuntimeError, match="通知写入失败"):
            await act(client, developer, issue, "claim")
    finally:
        event.remove(sessions, "before_flush", interrupt)
    assert (await client.get(path, headers=tester)).json() == issue
    assert await entries(client, tester) == []
    assert (await act(client, developer, issue, "claim")).status_code == 200
    assert [item["event"] for item in await entries(client, tester)] == ["claimed"]
