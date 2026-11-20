import time
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from .errors import api_error, validation_error
from .issue_schemas import (
    COMMON_FIELDS, AttachmentInfo, IssueAction, IssueDetail, IssueForm, IssuePerson,
    IssueSummary, IssueWrite,
)
from .models import AccountStatus, Issue, IssueAttachment, IssueStatus, User, UserRole


def not_found() -> HTTPException:
    return api_error(404, "issue_not_found", "事项或附件不可用")


def conflict() -> HTTPException:
    return api_error(409, "issue_conflict", "事项已更新，请重新打开后再操作")


def issue_detail(db: Session, issue: Issue) -> IssueDetail:
    files = db.scalars(select(IssueAttachment).where(IssueAttachment.issue_id == issue.id).order_by(IssueAttachment.id))
    form = IssueForm(**{key: getattr(issue, key) for key in COMMON_FIELDS}, **issue.details)
    return IssueDetail(
        **IssueSummary.model_validate(issue).model_dump(), version=issue.version, form=form,
        attachments=[AttachmentInfo.model_validate(file) for file in files],
        creator=IssuePerson.model_validate(db.get(User, issue.creator_id)),
        assignee=IssuePerson.model_validate(db.get(User, issue.assignee_id)) if issue.assignee_id else None,
        feedback=issue.feedback, feedback_at=issue.feedback_at,
    )


def save_issue(
    issue_id: UUID, db: Session, user: User, data: IssueWrite, attachments: list[tuple[str, bytes]],
) -> IssueDetail:
    issue = db.get(Issue, issue_id, with_for_update=True)
    if issue is not None:
        if issue.creator_id != user.id:
            raise not_found()
        if issue.last_write_id == data.write_id:
            return issue_detail(db, issue)
        if issue.status != IssueStatus.DRAFT or issue.version != data.version:
            raise conflict()
    elif data.version is not None:
        raise not_found()
    else:
        issue = Issue(id=issue_id, creator_id=user.id)

    if data.submit and (fields := data.form.missing_fields()):
        raise validation_error(fields)

    if data.assignee_id is not None:
        # 锁住候选账号，使提交校验与停用、角色修改按事务顺序生效。
        assignee = db.get(User, data.assignee_id, with_for_update={"read": True}, populate_existing=True)
        if assignee is None or assignee.role != UserRole.DEVELOPER or assignee.status != AccountStatus.ACTIVE:
            raise validation_error({"assignee_id": "该开发账号已不可用，请重新选择。"})

    current_ids = set(db.scalars(select(IssueAttachment.id).where(IssueAttachment.issue_id == issue_id)))
    keep_ids = set(data.keep_attachments)
    if not keep_ids.issubset(current_ids):
        raise validation_error({"attachments": "附件列表已变化，请重新打开事项。"})
    if removed := current_ids - keep_ids:
        db.execute(delete(IssueAttachment).where(IssueAttachment.id.in_(removed)))

    for key in COMMON_FIELDS:
        setattr(issue, key, getattr(data.form, key))
    issue.details = data.form.detail_values()
    issue.updated_at = time.time_ns() // 1_000_000
    issue.last_write_id = data.write_id
    issue.assignee_id = data.assignee_id
    issue.status = IssueStatus.DRAFT
    if data.submit:
        issue.status = IssueStatus.PENDING_WORK if data.assignee_id else IssueStatus.PENDING_CLAIM
    try:
        db.add(issue)
        db.flush()
        db.add_all(IssueAttachment(issue_id=issue_id, name=name, size=len(content), content=content)
                   for name, content in attachments)
        db.flush()
        result = issue_detail(db, issue)
        db.commit()
    except StaleDataError:
        db.rollback()
        raise conflict() from None
    except IntegrityError:
        # 并发创建时，已提交的相同请求可安全重放。
        db.rollback()
        existing = db.get(Issue, issue_id, with_for_update={"read": True})
        if existing is None:
            raise
        if existing.creator_id != user.id:
            raise not_found() from None
        if existing.last_write_id == data.write_id:
            return issue_detail(db, existing)
        raise conflict() from None
    return result


def act_on_issue(issue_id: UUID, data: IssueAction, db: Session, user: User) -> IssueDetail:
    issue = db.get(Issue, issue_id, with_for_update=True)
    if issue is None or issue.status == IssueStatus.DRAFT:
        raise not_found()
    if data.action == "claim" and issue.status != IssueStatus.PENDING_CLAIM and issue.assignee_id != user.id:
        raise api_error(409, "claim_unavailable", "该事项已被其他开发领取。")
    if issue.status != IssueStatus.PENDING_CLAIM and issue.assignee_id != user.id:
        raise not_found()
    if issue.last_write_id == data.write_id:
        return issue_detail(db, issue)
    expected = {"claim": IssueStatus.PENDING_CLAIM, "start": IssueStatus.PENDING_WORK, "finish": IssueStatus.IN_PROGRESS}
    if issue.version != data.version or issue.status != expected[data.action]:
        raise conflict()
    if data.action != "claim" and issue.assignee_id != user.id:
        raise not_found()
    if data.action == "finish" and not data.feedback:
        raise validation_error({"feedback": "请填写处理说明"})

    now = time.time_ns() // 1_000_000
    if data.action == "claim":
        issue.assignee_id = user.id
        issue.status = IssueStatus.PENDING_WORK
    elif data.action == "start":
        issue.status = IssueStatus.IN_PROGRESS
    else:
        issue.feedback = data.feedback
        issue.feedback_at = now
        issue.status = IssueStatus.PENDING_VERIFY
    issue.updated_at = now
    issue.last_write_id = data.write_id
    try:
        db.flush()
        result = issue_detail(db, issue)
        db.commit()
    except StaleDataError:
        db.rollback()
        current = db.get(Issue, issue_id, with_for_update={"read": True})
        if current and current.assignee_id == user.id and current.last_write_id == data.write_id:
            return issue_detail(db, current)
        if data.action == "claim":
            raise api_error(409, "claim_unavailable", "该事项已被其他开发领取。") from None
        raise conflict() from None
    return result


def delete_draft(issue_id: UUID, db: Session, user: User, version: int) -> None:
    issue = db.get(Issue, issue_id, with_for_update=True)
    if issue is None or issue.creator_id != user.id:
        raise not_found()
    if issue.status != IssueStatus.DRAFT or issue.version != version:
        raise conflict()
    db.execute(delete(IssueAttachment).where(IssueAttachment.issue_id == issue_id))
    db.delete(issue)
    try:
        db.commit()
    except StaleDataError:
        db.rollback()
        raise conflict() from None
