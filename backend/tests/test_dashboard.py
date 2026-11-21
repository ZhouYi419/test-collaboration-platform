from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from app import issue_service
from app.dashboard import beijing, midnight_ms
from test_issue_verification import verify
from test_issue_workflow import act, user_id
from test_issues import BUG, session, write

pytestmark = pytest.mark.anyio


async def statistics(client, headers, **params):
    response = await client.get("/api/dashboard", headers=headers, params=params)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


async def create_issue(client, tester, assignee=None, submit=True):
    response = await write(client, tester, f"/api/issues/{uuid4()}", form=BUG, assignee_id=assignee, submit=submit)
    assert response.status_code == 200, response.text
    return response.json()


async def move(client, developer, issue, action, **options):
    response = await act(client, developer, issue, action, **options)
    assert response.status_code == 200, response.text
    return response.json()


async def test_snapshot_respects_roles_and_shared_queue(app, client):
    tester = session(app)
    other_tester = session(app)
    developer = session(app, "developer")
    other_developer = session(app, "developer")
    admin = session(app, "admin")
    await create_issue(client, tester, submit=False)
    available = await create_issue(client, tester)
    other = await create_issue(client, other_tester, user_id(app, other_developer))
    await create_issue(client, tester, user_id(app, developer))

    personal = await statistics(client, tester)
    assert personal["status_counts"] == {
        "pending_claim": 1, "pending_work": 1, "in_progress": 0, "pending_verify": 0, "closed": 0,
    }
    assert personal["available_to_claim"] is None
    work = await statistics(client, developer)
    assert work["status_counts"] == {"pending_work": 1, "in_progress": 0, "pending_verify": 0, "closed": 0}
    assert work["available_to_claim"] == 1
    assert (await statistics(client, other_tester))["status_counts"]["pending_work"] == 1
    summary = await statistics(client, admin)
    assert summary["role"] == "admin" and sum(summary["status_counts"].values()) == 3
    assert summary["status_counts"]["pending_work"] == 2
    assert other["id"] not in str(summary) and BUG["title"] not in str(summary)
    assert (await client.get(f"/api/issues/{other['id']}", headers=admin)).status_code == 403
    assert (await client.get("/api/dashboard", headers=session(app, None))).status_code == 403
    assert (await client.get("/api/dashboard")).status_code == 401

    claimed = await move(client, developer, available, "claim")
    started = await move(client, developer, claimed, "start")
    await move(client, developer, started, "finish", feedback="已完成处理")
    assert (await statistics(client, tester))["status_counts"]["pending_verify"] == 1
    actual = await statistics(client, developer)
    assert actual["available_to_claim"] == 0 and actual["status_counts"]["pending_verify"] == 1
    assert (await statistics(client, other_developer))["activity"]["totals"]["feedback"] == 0
    assert (await statistics(client, admin))["activity"]["totals"]["feedback"] == 1


async def test_activity_counts_rounds_once_at_inclusive_beijing_boundaries(app, client, monkeypatch):
    tester = session(app)
    developer = session(app, "developer")
    assignee = user_id(app, developer)
    today = datetime.now(beijing).date()
    first = today - timedelta(days=2)
    last = today - timedelta(days=1)
    lower, upper = midnight_ms(first), midnight_ms(today)
    now = lower - 1
    monkeypatch.setattr(issue_service.time, "time_ns", lambda: now * 1_000_000)
    dates = {"start": first.isoformat(), "end": last.isoformat()}

    item = await create_issue(client, tester, assignee)
    item = await move(client, developer, item, "start")
    item = await move(client, developer, item, "finish", feedback="区间前的反馈")
    assert (await statistics(client, tester, **dates))["activity"]["totals"]["feedback"] == 0
    now = lower
    returned = await verify(client, tester, item, "returned", reason="仍有问题")
    assert returned.status_code == 200
    item = await move(client, developer, returned.json(), "finish", feedback="区间开始时的反馈")
    pending = await statistics(client, tester, **dates)
    assert pending["status_counts"]["pending_verify"] == 1
    assert pending["activity"]["buckets"][0] == {
        "start": first.isoformat(), "end": first.isoformat(), "feedback": 1, "passed": 0, "returned": 1,
    }

    now = upper - 1
    closed = await verify(client, tester, item, "passed")
    assert closed.status_code == 200
    final = await statistics(client, developer, **dates)
    assert final["status_counts"]["closed"] == 1
    assert final["activity"]["totals"] == {"feedback": 1, "passed": 1, "returned": 1}
    assert final["activity"]["buckets"][1]["passed"] == 1
    next_day = await statistics(client, tester, start=today.isoformat(), end=today.isoformat())
    assert next_day["activity"]["totals"] == {"feedback": 0, "passed": 0, "returned": 0}
    assert next_day["status_counts"]["closed"] == 1


async def test_dashboard_windows_and_invalid_dates(app, client):
    tester = session(app)
    today = datetime.now(beijing).date()
    for params, count in [({}, 7), ({"days": "30"}, 30)]:
        activity = (await statistics(client, tester, **params))["activity"]
        assert activity["end"] == today.isoformat()
        assert activity["start"] == (today - timedelta(days=count - 1)).isoformat()
        assert len(activity["buckets"]) == count

    past = (today - timedelta(days=74)).isoformat()
    contiguous = (await statistics(client, tester, start=past, end=today.isoformat()))["activity"]["buckets"]
    assert len(contiguous) <= 31 and contiguous[0]["start"] == past and contiguous[-1]["end"] == today.isoformat()
    for params in [
        {"days": "8"},
        {"start": "2025-01-01"},
        {"start": "2025-02-29", "end": "2025-03-01"},
        {"start": "2025-01-02", "end": "2025-01-01"},
        {"start": today.isoformat(), "end": (today + timedelta(days=1)).isoformat()},
    ]:
        assert (await client.get("/api/dashboard", headers=tester, params=params)).status_code == 422
