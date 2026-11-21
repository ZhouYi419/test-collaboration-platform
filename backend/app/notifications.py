import time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.sql.elements import ColumnElement

from .database import Database
from .errors import api_error
from .issues import IssueUser, visible_to
from .models import Issue, IssueStatus, Notification, NotificationEvent, User

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
page_size = 6
recent_limit = 20


class NotificationItem(BaseModel):
    id: int
    issue_id: UUID
    title: str
    event: NotificationEvent
    created_at: int
    read_at: int | None


class NotificationPage(BaseModel):
    items: list[NotificationItem]
    next_before: int | None


class NotificationSummary(BaseModel):
    unread_count: int
    recent: list[NotificationItem]


class ReadNotification(BaseModel):
    issue_id: UUID


class NotificationReadResult(BaseModel):
    read_at: int


def notification_scope(user: User) -> ColumnElement[bool]:
    visible_issues = select(Issue.id).where(visible_to(user), Issue.status != IssueStatus.DRAFT)
    return and_(Notification.recipient_id == user.id, Notification.issue_id.in_(visible_issues))


def notification_items(db: Database, scope: ColumnElement[bool], limit: int) -> list[NotificationItem]:
    rows = db.execute(
        select(Notification.id, Notification.issue_id, Issue.title, Notification.event,
               Notification.created_at, Notification.read_at)
        .join(Issue, Issue.id == Notification.issue_id)
        .where(scope)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
    )
    return [NotificationItem.model_validate(row._mapping) for row in rows]


@router.get("", response_model=NotificationPage)
def list_notifications(db: Database, user: IssueUser, before: Annotated[int | None, Query(ge=1, le=2_147_483_647)] = None):
    scope = notification_scope(user)
    if before is not None:
        created_at = db.scalar(select(Notification.created_at).where(scope, Notification.id == before))
        if created_at is None:
            raise api_error(404, "notification_not_found", "消息不可用")
        scope = and_(scope, or_(
            Notification.created_at < created_at,
            and_(Notification.created_at == created_at, Notification.id < before),
        ))
    items = notification_items(db, scope, page_size + 1)
    return NotificationPage(items=items[:page_size], next_before=items[page_size - 1].id if len(items) > page_size else None)


@router.get("/summary", response_model=NotificationSummary)
def notification_summary(db: Database, user: IssueUser):
    scope = notification_scope(user)
    recent = notification_items(db, scope, recent_limit)
    unread_count = db.scalar(select(func.count(Notification.id)).where(scope, Notification.read_at.is_(None)))
    return NotificationSummary(unread_count=unread_count or 0, recent=recent)


@router.put("/read", status_code=204)
def read_all_notifications(db: Database, user: IssueUser):
    db.execute(update(Notification).where(notification_scope(user), Notification.read_at.is_(None))
               .values(read_at=time.time_ns() // 1_000_000))
    db.commit()
    return Response(status_code=204)


@router.put("/{notification_id}/read", response_model=NotificationReadResult)
def read_notification(
    notification_id: Annotated[int, Path(ge=1, le=2_147_483_647)],
    data: ReadNotification, db: Database, user: IssueUser,
):
    scope = and_(
        notification_scope(user), Notification.id == notification_id, Notification.issue_id == data.issue_id,
    )
    db.execute(update(Notification).where(scope, Notification.read_at.is_(None))
               .values(read_at=time.time_ns() // 1_000_000))
    read_at = db.scalar(select(Notification.read_at).where(scope))
    if read_at is None:
        raise api_error(404, "notification_not_found", "消息不可用")
    db.commit()
    return NotificationReadResult(read_at=read_at)
