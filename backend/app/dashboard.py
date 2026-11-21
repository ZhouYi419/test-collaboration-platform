from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import BigInteger, func, literal, select, union_all
from sqlalchemy.sql.elements import ColumnElement

from .auth import get_current_user
from .database import Database
from .errors import api_error, validation_error
from .models import Issue, IssueStatus, IssueVerification, User, UserRole

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
beijing = timezone(timedelta(hours=8))
day_ms = 86_400_000
max_buckets = 31


class ActivityCounts(BaseModel):
    feedback: int
    passed: int
    returned: int


class ActivityBucket(ActivityCounts):
    start: date
    end: date


class DashboardActivity(BaseModel):
    start: date
    end: date
    today: date
    totals: ActivityCounts
    buckets: list[ActivityBucket]


class Dashboard(BaseModel):
    role: UserRole
    as_of: int
    status_counts: dict[IssueStatus, int]
    available_to_claim: int | None
    activity: DashboardActivity


def date_range(today: date, days: str, start: str | None, end: str | None) -> tuple[date, date]:
    if start is None and end is None:
        return today - timedelta(days=int(days) - 1), today

    values: dict[str, date] = {}
    errors: dict[str, str] = {}
    for field, value in (("start", start), ("end", end)):
        try:
            values[field] = date.fromisoformat(value or "")
        except ValueError:
            errors[field] = "请输入有效日期。"
        else:
            if values[field] > today:
                errors[field] = "日期不能晚于今天。"
    if errors:
        raise validation_error(errors)
    if values["end"] < values["start"]:
        raise validation_error({"end": "结束日期不能早于开始日期。"})
    return values["start"], values["end"]


def midnight_ms(value: date) -> int:
    return int(datetime.combine(value, time.min, beijing).timestamp()) * 1000


def in_period(occurred_at: ColumnElement[int], lower: int, upper: int):
    return occurred_at >= lower, occurred_at < upper


@router.get("", response_model=Dashboard)
def dashboard(
    db: Database,
    user: Annotated[User, Depends(get_current_user)],
    days: Literal["7", "30"] = "7",
    start: Annotated[str | None, Query(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")] = None,
    end: Annotated[str | None, Query(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")] = None,
) -> Dashboard:
    if user.role is None:
        raise api_error(403, "dashboard_role_required", "当前账号无权访问统计看板")
    role = UserRole(user.role)
    now = datetime.now(beijing)
    first, last = date_range(now.date(), days, start, end)
    duration = (last - first).days + 1
    step = (duration + max_buckets - 1) // max_buckets
    lower = midnight_ms(first)
    upper = lower + duration * day_ms

    scoped = select(Issue.id, Issue.status, Issue.feedback_at).where(Issue.status != IssueStatus.DRAFT)
    if role == UserRole.TESTER:
        scoped = scoped.where(Issue.creator_id == user.id)
    elif role == UserRole.DEVELOPER:
        scoped = scoped.where(Issue.assignee_id == user.id)
    issues = scoped.cte("dashboard_issues")

    # 以前已验证的反馈记录在验证表中，当前未验证的反馈从事项取值，两者各代表不同轮次。
    verification_feedback = (
        select(literal("feedback").label("event"), IssueVerification.feedback_at.label("occurred_at"))
        .join(issues, issues.c.id == IssueVerification.issue_id)
        .where(*in_period(IssueVerification.feedback_at, lower, upper))
    )
    current_feedback = (
        select(literal("feedback"), issues.c.feedback_at)
        .where(issues.c.status == IssueStatus.PENDING_VERIFY, *in_period(issues.c.feedback_at, lower, upper))
    )
    verifications = (
        select(IssueVerification.outcome, IssueVerification.verified_at)
        .join(issues, issues.c.id == IssueVerification.issue_id)
        .where(*in_period(IssueVerification.verified_at, lower, upper))
    )
    events = union_all(verification_feedback, current_feedback, verifications).subquery()
    bucket = (events.c.occurred_at - literal(lower, BigInteger)) // literal(step * day_ms, BigInteger)
    activity_counts = (
        select(events.c.event.label("kind"), literal("").label("status"), bucket.label("bucket"), func.count().label("total"))
        .group_by(events.c.event, bucket)
    )
    status_counts = (
        select(literal("status"), issues.c.status, literal(0), func.count()).group_by(issues.c.status)
    )
    statements = [activity_counts, status_counts]
    if role == UserRole.DEVELOPER:
        statements.append(select(literal("shared"), literal(""), literal(0), func.count())
                          .select_from(Issue).where(Issue.status == IssueStatus.PENDING_CLAIM))

    states = {status: 0 for status in IssueStatus if status != IssueStatus.DRAFT}
    shared = None
    if role == UserRole.DEVELOPER:
        states.pop(IssueStatus.PENDING_CLAIM)
    counts = [dict(feedback=0, passed=0, returned=0) for _ in range((duration + step - 1) // step)]
    # 单条 SQL 让当前轮次与历史轮次共用同一个读取快照。
    for kind, status, position, total in db.execute(union_all(*statements)):
        if kind == "status":
            states[IssueStatus(status)] = total
        elif kind == "shared":
            shared = total
        else:
            counts[position][kind] = total

    buckets = [
        ActivityBucket(start=first + timedelta(days=index * step),
                       end=min(last, first + timedelta(days=(index + 1) * step - 1)), **row)
        for index, row in enumerate(counts)
    ]
    totals = ActivityCounts(**{kind: sum(row[kind] for row in counts) for kind in counts[0]})
    return Dashboard(role=role, as_of=int(now.timestamp() * 1000), status_counts=states, available_to_claim=shared,
                     activity=DashboardActivity(start=first, end=last, today=now.date(), totals=totals, buckets=buckets))
