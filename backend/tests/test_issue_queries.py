from uuid import UUID, uuid4

import pytest

from app import issue_service
from app.models import Issue
from test_issue_verification import submit_and_finish, verify
from test_issue_workflow import act, user_id
from test_issues import BUG, REQUEST, session, write

pytestmark = pytest.mark.anyio


async def create(client, tester, form, *, assignee=None, submit=True):
    response = await write(
        client, tester, f"/api/issues/{uuid4()}", form=form, submit=submit, assignee_id=assignee,
    )
    assert response.status_code == 200, response.text
    return response.json()


async def query(client, headers, *, endpoint="/api/issues", **params):
    response = await client.get(endpoint, headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


async def test_list_search_combines_filters_and_paginates_in_stable_order(app, client):
    tester = session(app)
    outsider = session(app)
    tickets = [
        await create(client, tester, {
            **(BUG if index % 2 else REQUEST), "title": f"执行报告 {index:02d}",
            "description": "包含 CSV_50% 的记录" if index in {3, 4} else "普通说明",
            "priority": "P2" if index in {3, 4} else "P0",
        })
        for index in range(22)
    ]
    draft = await create(client, tester, {}, submit=False)
    private = await create(client, outsider, {**BUG, "title": "执行报告 私有", "description": "CSV_50%", "priority": "P2"})
    with app.state.session_factory() as db:
        for index, issue in enumerate(tickets):
            db.get(Issue, UUID(issue["id"])).updated_at = 1 + index // 2
        db.get(Issue, UUID(draft["id"])).updated_at = 0
        db.commit()

    first = await query(client, tester)
    second = await query(client, tester, page=2)
    expected = [ticket["id"] for index, ticket in
                sorted(enumerate(tickets), key=lambda row: (-(row[0] // 2), row[1]["id"]))] + [draft["id"]]
    assert first["has_next"] and not second["has_next"]
    assert len(first["items"]) == 20
    assert [item["id"] for item in first["items"] + second["items"]] == expected
    assert await query(client, tester, page=3) == {"items": [], "has_next": False}
    oldest = await query(client, tester, sort="oldest")
    assert oldest["items"][0]["id"] == draft["id"]
    priorities = await query(client, tester, sort="priority", page=2)
    assert priorities["items"][-1]["id"] == draft["id"]
    assert (await query(client, tester, q="执行报告 08"))["items"][0]["id"] == tickets[8]["id"]
    combined = await query(client, tester, q="  csv_50%  ", type="bug", priority="P2", status="pending_claim")
    assert [item["id"] for item in combined["items"]] == [tickets[3]["id"]]
    assert [item["id"] for item in (await query(client, outsider, q="CSV_50%"))["items"]] == [private["id"]]
    assert await query(client, tester, q="CSV%") == {"items": [], "has_next": False}
    assert (await query(client, tester, status="draft"))["items"][0]["id"] == draft["id"]


async def test_developer_filters_stay_in_queue_and_owner_scope(app, client):
    tester = session(app)
    developer = session(app, "developer")
    other = session(app, "developer")
    form = {**BUG, "title": "报告筛选异常"}
    pending = await create(client, tester, form)
    assigned = await create(client, tester, form, assignee=user_id(app, developer))
    await create(client, tester, form, assignee=user_id(app, other))
    feedback = await submit_and_finish(app, client, tester, developer, form)
    closed = (await verify(client, tester, feedback, "passed")).json()
    endpoint = "/api/issues/development"
    for queue, expected in [("inbox", pending), ("assigned", assigned), ("feedback", closed)]:
        result = await query(client, developer, endpoint=endpoint, queue=queue, q="报告筛选", type="bug")
        assert [item["id"] for item in result["items"]] == [expected["id"]]
    assert (await query(client, other, endpoint=endpoint, queue="feedback", q="报告筛选"))["items"] == []
    assert (await query(client, developer, endpoint=endpoint, queue="assigned", status="closed"))["items"] == []


async def test_invalid_query_parameters_return_field_errors(app, client):
    tester = session(app)
    for field, value in [
        ("q", "文" * 101), ("q", "\x00"), ("page", 0), ("page", 1_000_001),
        ("sort", "invalid"), ("status", "invalid"), ("type", "bad"), ("priority", "P4"),
    ]:
        response = await client.get("/api/issues", headers=tester, params={field: value})
        assert response.status_code == 422
        assert field in response.json()["detail"]["fields"]
    assert (await client.get("/api/issues", params={"q": "标题"})).status_code == 401


async def test_history_keeps_rounds_in_version_order_and_omits_duplicate_feedback(app, client, monkeypatch):
    tester = session(app)
    developer = session(app, "developer")
    other_developer = session(app, "developer")
    other_tester = session(app)
    monkeypatch.setattr(issue_service.time, "time_ns", lambda: 1_800_000_000_000_000_000)
    issue = await submit_and_finish(app, client, tester, developer, REQUEST)
    path = f"/api/issues/{issue['id']}/history"

    async def read(headers):
        response = await client.get(path, headers=headers)
        assert response.status_code == 200, response.text
        return response.json()

    assert (await read(tester))[0]["verification"] is None
    for index in (1, 2):
        returned = await verify(client, tester, issue, "returned", reason=f"退回原因 {index}")
        assert returned.status_code == 200, returned.text
        history = await read(developer)
        assert len(history) == index and history[0]["number"] == index
        assert history[0]["verification"]["reason"] == f"退回原因 {index}"
        finished = await act(client, developer, returned.json(), "finish", feedback=f"处理反馈 {index + 1}")
        assert finished.status_code == 200, finished.text
        issue = finished.json()
        pending = (await read(tester))[0]
        assert pending["number"] == index + 1 and pending["verification"] is None

    assert (await verify(client, tester, issue, "passed")).status_code == 200
    history = await read(tester)
    assert history == await read(developer)
    assert [entry["number"] for entry in history] == [3, 2, 1]
    assert [entry["feedback"] for entry in history] == ["处理反馈 3", "处理反馈 2", "初次处理说明"]
    assert [entry["verification"]["outcome"] for entry in history] == ["passed", "returned", "returned"]
    assert all(entry["developer"]["id"] == user_id(app, developer) for entry in history)
    assert all(entry["verification"]["tester"]["id"] == user_id(app, tester) for entry in history)
    for account, status in [({}, 401), (session(app, "admin"), 403), (other_developer, 404), (other_tester, 404)]:
        assert (await client.get(path, headers=account)).status_code == status

    unclaimed = await create(client, tester, BUG)
    unclaimed_path = f"/api/issues/{unclaimed['id']}"
    assert (await client.get(unclaimed_path, headers=developer)).status_code == 200
    assert (await client.get(unclaimed_path + "/history", headers=developer)).status_code == 404
    assert (await client.get(unclaimed_path + "/history", headers=tester)).json() == []
