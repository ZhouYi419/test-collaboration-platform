from typing import Annotated, Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import load_only
from sqlalchemy.sql.elements import ColumnElement

from . import issue_service
from .auth import get_current_user
from .database import Database
from .errors import api_error
from .issue_schemas import IssueAction, IssueDetail, IssuePerson, IssueSummary
from .issue_uploads import Submission, parse_submission
from .models import AccountStatus, Issue, IssueAttachment, IssueStatus, User, UserRole

router = APIRouter(prefix="/api/issues", tags=["issues"])


def require_tester(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != UserRole.TESTER:
        raise api_error(403, "tester_required", "我的事项仅向测试人员开放")
    return user


Tester = Annotated[User, Depends(require_tester)]


def require_issue_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in {UserRole.TESTER, UserRole.DEVELOPER}:
        raise api_error(403, "issue_role_required", "当前账号无权访问事项")
    return user


def require_developer(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != UserRole.DEVELOPER:
        raise api_error(403, "developer_required", "开发事项仅向开发人员开放")
    return user


IssueUser = Annotated[User, Depends(require_issue_user)]
Developer = Annotated[User, Depends(require_developer)]


def visible_to(user: User) -> ColumnElement[bool]:
    if user.role == UserRole.TESTER:
        return Issue.creator_id == user.id
    return or_(
        Issue.status == IssueStatus.PENDING_CLAIM,
        and_(Issue.assignee_id == user.id, Issue.status != IssueStatus.DRAFT),
    )


async def read_submission(request: Request, _: Tester) -> Submission:
    return await parse_submission(request)


@router.get("/developers", response_model=list[IssuePerson])
def list_developers(db: Database, _: Tester):
    return db.scalars(
        select(User).options(load_only(User.id, User.username))
        .where(User.role == UserRole.DEVELOPER, User.status == AccountStatus.ACTIVE)
        .order_by(User.username_key, User.id)
    ).all()


@router.get("/development", response_model=list[IssueSummary])
def developer_issues(
    db: Database, user: Developer, queue: Literal["inbox", "assigned", "feedback"] = "inbox",
):
    conditions = {
        "inbox": Issue.status == IssueStatus.PENDING_CLAIM,
        "assigned": and_(Issue.assignee_id == user.id, Issue.status.in_([
            IssueStatus.PENDING_WORK, IssueStatus.IN_PROGRESS,
        ])),
        "feedback": and_(Issue.assignee_id == user.id, Issue.status == IssueStatus.PENDING_VERIFY),
    }
    return db.scalars(
        select(Issue).options(load_only(
            Issue.id, Issue.type, Issue.title, Issue.priority, Issue.status, Issue.updated_at,
        )).where(conditions[queue]).order_by(Issue.updated_at.desc(), Issue.id)
    ).all()


@router.get("", response_model=list[IssueSummary])
def list_issues(db: Database, user: Tester):
    return db.scalars(
        select(Issue)
        .options(load_only(Issue.id, Issue.type, Issue.title, Issue.priority, Issue.status, Issue.updated_at))
        .where(Issue.creator_id == user.id)
        .order_by(Issue.updated_at.desc(), Issue.id)
    ).all()


@router.get("/{issue_id}", response_model=IssueDetail)
def get_issue(issue_id: UUID, db: Database, user: IssueUser) -> IssueDetail:
    issue = db.scalar(
        select(Issue).where(Issue.id == issue_id, visible_to(user)).with_for_update(read=True)
    )
    if issue is None:
        raise issue_service.not_found()
    return issue_service.issue_detail(db, issue)


@router.put("/{issue_id}", response_model=IssueDetail)
def save_issue(
    issue_id: UUID, db: Database, user: Tester, submission: Annotated[Submission, Depends(read_submission)],
) -> IssueDetail:
    return issue_service.save_issue(issue_id, db, user, submission.data, submission.attachments)


@router.post("/{issue_id}/actions", response_model=IssueDetail)
def act_on_issue(issue_id: UUID, data: IssueAction, db: Database, user: Developer) -> IssueDetail:
    return issue_service.act_on_issue(issue_id, data, db, user)


@router.delete("/{issue_id}", status_code=204)
def delete_draft(issue_id: UUID, db: Database, user: Tester, version: Annotated[int, Query(ge=1)]) -> Response:
    issue_service.delete_draft(issue_id, db, user, version)
    return Response(status_code=204)


@router.get("/{issue_id}/attachments/{attachment_id}")
def download_attachment(issue_id: UUID, attachment_id: int, db: Database, user: IssueUser) -> Response:
    row = db.execute(
        select(IssueAttachment.name, IssueAttachment.content)
        .join(Issue, Issue.id == IssueAttachment.issue_id)
        .where(IssueAttachment.id == attachment_id, Issue.id == issue_id, visible_to(user))
    ).one_or_none()
    if row is None:
        raise issue_service.not_found()
    return Response(row.content, media_type="application/octet-stream", headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(row.name, safe='')}",
        "X-Content-Type-Options": "nosniff",
    })
