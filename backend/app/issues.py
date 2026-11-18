import time
from codecs import BOM_UTF16_BE, BOM_UTF16_LE
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Annotated, Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import ValidationError
from python_multipart.exceptions import MultipartParseError
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import load_only
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from .auth import Database, auth_error, get_current_user
from .issue_schemas import (
    COMMON_FIELDS, FIELD_LABELS, AttachmentInfo, IssueAction, IssueDetail, IssueForm, IssuePerson,
    IssueSummary, IssueWrite,
)
from .models import AccountStatus, Issue, IssueAttachment, IssueStatus, User, UserRole

router = APIRouter(prefix="/api/issues", tags=["issues"])
MAX_FILES = 5
MAX_FILE_SIZE = 10_000_000
MAX_REQUEST_SIZE = MAX_FILES * MAX_FILE_SIZE + 256_000
SIGNATURES = {".png": b"\x89PNG\r\n\x1a\n", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff", ".pdf": b"%PDF-"}


def require_tester(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != UserRole.TESTER:
        raise auth_error(403, "tester_required", "我的事项仅向测试人员开放")
    return user


Tester = Annotated[User, Depends(require_tester)]


def require_issue_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in {UserRole.TESTER, UserRole.DEVELOPER}:
        raise auth_error(403, "issue_role_required", "当前账号无权访问事项")
    return user


def require_developer(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != UserRole.DEVELOPER:
        raise auth_error(403, "developer_required", "开发事项仅向开发人员开放")
    return user


IssueUser = Annotated[User, Depends(require_issue_user)]
Developer = Annotated[User, Depends(require_developer)]


def visible_to(user: User):
    if user.role == UserRole.TESTER:
        return Issue.creator_id == user.id
    return or_(
        Issue.status == IssueStatus.PENDING_CLAIM,
        and_(Issue.assignee_id == user.id, Issue.status != IssueStatus.DRAFT),
    )


def validation_error(fields: dict[str, str]) -> HTTPException:
    return HTTPException(
        422, detail={"code": "validation_error", "message": "请检查表单输入", "fields": fields},
    )


def attachment_error(message: str) -> HTTPException:
    return validation_error({"attachments": message})


def is_supported_file(name: str, content: bytes) -> bool:
    extension = PurePosixPath(name).suffix.lower()
    if extension in SIGNATURES:
        return content.startswith(SIGNATURES[extension])
    if extension in {".txt", ".log"}:
        encodings = ("utf-16",) if content.startswith((BOM_UTF16_LE, BOM_UTF16_BE)) else ("utf-8-sig", "gb18030")
        for encoding in encodings:
            try:
                return "\x00" not in content.decode(encoding)
            except UnicodeDecodeError:
                continue
    return False


@dataclass
class Submission:
    data: IssueWrite
    attachments: list[tuple[str, bytes]]


async def read_submission(request: Request, _: Tester) -> Submission:
    async def limited_stream():
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_REQUEST_SIZE:
                raise MultiPartException("提交内容超过大小限制")
            yield chunk

    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "multipart/form-data":
        raise auth_error(415, "unsupported_media_type", "请使用表单上传")
    try:
        form = await MultiPartParser(
            request.headers, limited_stream(), max_files=MAX_FILES, max_fields=1, max_part_size=256_000,
        ).parse()
    except (MultiPartException, MultipartParseError) as exc:
        raise attachment_error("无法读取上传表单。每条事项最多 5 个附件，每个最大 10 MB。") from exc

    try:
        if any(key not in {"data", "files"} for key in form):
            raise validation_error({})
        payload = form.get("data")
        if not isinstance(payload, str):
            raise validation_error({})
        try:
            data = IssueWrite.model_validate_json(payload)
        except ValidationError as exc:
            fields = {
                error["loc"][-1]: f"请填写有效的{FIELD_LABELS[error['loc'][-1]]}"
                for error in exc.errors() if error["loc"] and error["loc"][-1] in FIELD_LABELS
            }
            raise validation_error(fields) from exc
        files = form.getlist("files")
        keep = set(data.keep_attachments)
        if len(keep) != len(data.keep_attachments) or len(keep) + len(files) > MAX_FILES:
            raise attachment_error("每条事项最多添加 5 个附件。")
        attachments = []
        for file in files:
            if not isinstance(file, UploadFile) or not file.filename:
                raise attachment_error("请选择有效的附件。")
            name = file.filename.replace("\\", "/").rsplit("/", 1)[-1]
            if not name.strip() or len(name) > 255 or any(ord(char) < 32 for char in name):
                raise attachment_error("附件名称无效或超过 255 个字符。")
            content = await file.read(MAX_FILE_SIZE + 1)
            if len(content) > MAX_FILE_SIZE:
                raise attachment_error(f"{name} 超过 10 MB。")
            if not is_supported_file(name, content):
                raise attachment_error(f"{name} 的格式或内容无效。")
            attachments.append((name, content))
        return Submission(data, attachments)
    finally:
        await form.close()


def not_found() -> HTTPException:
    return auth_error(404, "issue_not_found", "事项或附件不可用")


def conflict() -> HTTPException:
    return auth_error(409, "issue_conflict", "事项已更新，请重新打开后再操作")


def issue_detail(db: Database, issue: Issue) -> IssueDetail:
    files = db.scalars(select(IssueAttachment).where(IssueAttachment.issue_id == issue.id).order_by(IssueAttachment.id))
    form = IssueForm(**{key: getattr(issue, key) for key in COMMON_FIELDS}, **issue.details)
    return IssueDetail(
        **IssueSummary.model_validate(issue).model_dump(), version=issue.version, form=form,
        attachments=[AttachmentInfo.model_validate(file) for file in files],
        creator=IssuePerson.model_validate(db.get(User, issue.creator_id)),
        assignee=IssuePerson.model_validate(db.get(User, issue.assignee_id)) if issue.assignee_id else None,
        feedback=issue.feedback, feedback_at=issue.feedback_at,
    )


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
        raise not_found()
    return issue_detail(db, issue)


@router.put("/{issue_id}", response_model=IssueDetail)
def save_issue(
    issue_id: UUID, db: Database, user: Tester, submission: Annotated[Submission, Depends(read_submission)],
) -> IssueDetail:
    data = submission.data
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
        raise attachment_error("附件列表已变化，请重新打开事项。")
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
                   for name, content in submission.attachments)
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


@router.post("/{issue_id}/actions", response_model=IssueDetail)
def act_on_issue(issue_id: UUID, data: IssueAction, db: Database, user: Developer) -> IssueDetail:
    issue = db.get(Issue, issue_id, with_for_update=True)
    if issue is None or issue.status == IssueStatus.DRAFT:
        raise not_found()
    if data.action == "claim" and issue.status != IssueStatus.PENDING_CLAIM and issue.assignee_id != user.id:
        raise auth_error(409, "claim_unavailable", "该事项已被其他开发领取。")
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
            raise auth_error(409, "claim_unavailable", "该事项已被其他开发领取。") from None
        raise conflict() from None
    return result


@router.delete("/{issue_id}", status_code=204)
def delete_draft(issue_id: UUID, db: Database, user: Tester, version: Annotated[int, Query(ge=1)]) -> Response:
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
    return Response(status_code=204)


@router.get("/{issue_id}/attachments/{attachment_id}")
def download_attachment(issue_id: UUID, attachment_id: int, db: Database, user: IssueUser) -> Response:
    row = db.execute(
        select(IssueAttachment.name, IssueAttachment.content)
        .join(Issue, Issue.id == IssueAttachment.issue_id)
        .where(IssueAttachment.id == attachment_id, Issue.id == issue_id, visible_to(user))
    ).one_or_none()
    if row is None:
        raise not_found()
    return Response(row.content, media_type="application/octet-stream", headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(row.name, safe='')}",
        "X-Content-Type-Options": "nosniff",
    })
