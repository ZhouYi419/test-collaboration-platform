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
    IssueSummary, IssueWrite, VerificationResult, VerifyIssue,
)
from .models import AccountStatus, Issue, IssueAttachment, IssueStatus, IssueVerification, User, UserRole


def not_found() -> HTTPException:
    return api_error(404, "issue_not_found", "事项或附件不可用")


def conflict() -> HTTPException:
    return api_error(409, "issue_conflict", "事项已更新，请重新打开后再操作")


def issue_detail(db: Session, issue: Issue) -> IssueDetail:
    files = db.scalars(select(IssueAttachment).where(IssueAttachment.issue_id == issue.id).order_by(IssueAttachment.id))
    form = IssueForm(**{key: getattr(issue, key) for key in COMMON_FIELDS}, **issue.details)
    # SQLite 的详情查询可能读到并发写入的新记录，只返回当前事项版本已经包含的验证。
    latest = db.scalar(select(IssueVerification).where(
        IssueVerification.issue_id == issue.id, IssueVerification.issue_version < issue.version,
    ).order_by(IssueVerification.issue_version.desc()).limit(1))
    return IssueDetail(
        **IssueSummary.model_validate(issue).model_dump(), version=issue.version, form=form,
        attachments=[AttachmentInfo.model_validate(file) for file in files],
        creator=IssuePerson.model_validate(db.get(User, issue.creator_id)),
        assignee=IssuePerson.model_validate(db.get(User, issue.assignee_id)) if issue.assignee_id else None,
        feedback=issue.feedback, feedback_at=issue.feedback_at,
        latest_verification=VerificationResult(
            outcome=latest.outcome, reason=latest.reason, verified_at=latest.verified_at,
            tester=IssuePerson.model_validate(db.get(User, latest.tester_id)),
        ) if latest is not None else None,
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
    transitions = {
        "claim": (IssueStatus.PENDING_CLAIM, IssueStatus.PENDING_WORK),
        "start": (IssueStatus.PENDING_WORK, IssueStatus.IN_PROGRESS),
        "finish": (IssueStatus.IN_PROGRESS, IssueStatus.PENDING_VERIFY),
    }
    expected, destination = transitions[data.action]
    if issue.last_write_id == data.write_id and issue.version == data.version + 1 and issue.status == destination:
        return issue_detail(db, issue)
    if issue.version != data.version or issue.status != expected:
        raise conflict()
    if data.action != "claim" and issue.assignee_id != user.id:
        raise not_found()
    if data.action == "finish" and not data.feedback:
        raise validation_error({"feedback": "请填写处理说明"})

    now = time.time_ns() // 1_000_000
    if data.action == "claim":
        issue.assignee_id = user.id
    elif data.action == "finish":
        issue.feedback = data.feedback
        issue.feedback_at = now
    issue.status = destination
    issue.updated_at = now
    issue.last_write_id = data.write_id
    try:
        db.flush()
        result = issue_detail(db, issue)
        db.commit()
    except StaleDataError:
        db.rollback()
        current = db.get(Issue, issue_id, with_for_update={"read": True})
        if (current and current.assignee_id == user.id and current.last_write_id == data.write_id
                and current.version == data.version + 1 and current.status == destination):
            return issue_detail(db, current)
        if data.action == "claim":
            raise api_error(409, "claim_unavailable", "该事项已被其他开发领取。") from None
        raise conflict() from None
    return result


def verification_replayed(db: Session, issue: Issue, user: User, data: VerifyIssue) -> bool:
    record = db.scalar(select(IssueVerification).where(
        IssueVerification.issue_id == issue.id, IssueVerification.write_id == data.write_id,
    ))
    if record is None:
        return False
    if (record.tester_id, record.issue_version, record.outcome, record.reason) != (
        user.id, data.version, data.outcome, data.reason,
    ):
        raise conflict()
    return True


def verify_issue(issue_id: UUID, data: VerifyIssue, db: Session, user: User) -> IssueDetail:
    issue = db.get(Issue, issue_id, with_for_update=True)
    if issue is None or issue.creator_id != user.id:
        raise not_found()
    if verification_replayed(db, issue, user, data):
        # SQLite 上并发请求可能在读取事项之后才提交，重试要返回最新状态。
        db.refresh(issue, with_for_update={"read": True})
        return issue_detail(db, issue)
    if (issue.version != data.version or issue.status != IssueStatus.PENDING_VERIFY
            or not issue.feedback or issue.feedback_at is None):
        raise conflict()
    if data.outcome == "returned" and not data.reason:
        raise validation_error({"reason": "请填写退回原因"})
    if data.outcome == "passed" and data.reason is not None:
        raise validation_error({"reason": "验证通过时无需填写退回原因"})

    now = time.time_ns() // 1_000_000
    record = IssueVerification(
        issue_id=issue.id, issue_version=issue.version, tester_id=user.id, outcome=data.outcome,
        reason=data.reason, verified_at=now, feedback=issue.feedback, feedback_at=issue.feedback_at, write_id=data.write_id,
    )
    issue.status = IssueStatus.CLOSED if data.outcome == "passed" else IssueStatus.IN_PROGRESS
    issue.updated_at = now
    issue.last_write_id = data.write_id
    try:
        # 先确认版本竞争已胜出，再写入本轮验证记录。两次写入在同一事务提交。
        db.flush()
        db.add(record)
        db.flush()
        result = issue_detail(db, issue)
        db.commit()
    except StaleDataError:
        db.rollback()
        current = db.get(Issue, issue_id, with_for_update={"read": True})
        if current and current.creator_id == user.id and verification_replayed(db, current, user, data):
            return issue_detail(db, current)
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
