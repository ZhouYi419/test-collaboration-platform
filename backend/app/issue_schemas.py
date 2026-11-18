from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

IssueType = Literal["bug", "request"]
Priority = Literal["P0", "P1", "P2", "P3"]
Environment = Literal["dev", "uat", "prd"]
Severity = Literal["致命", "严重", "一般", "轻微"]
Title = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]

FIELD_LABELS = {
    "type": "申请类型", "priority": "优先级", "title": "标题", "description": "详细描述",
    "environment": "发生环境", "severity": "严重程度", "steps": "复现步骤",
    "actual": "实际结果", "expected": "预期结果", "version_affected": "影响版本",
    "background": "需求背景", "outcome": "期望效果", "acceptance": "验收标准",
    "scope": "影响范围", "due": "期望完成日期",
    "assignee_id": "指定开发", "feedback": "处理说明",
}
COMMON_FIELDS = ("type", "priority", "title", "description")
REQUIRED_BY_TYPE = {
    "bug": ("environment", "severity", "steps", "actual", "expected"),
    "request": ("background", "outcome", "acceptance"),
}
OPTIONAL_BY_TYPE = {"bug": ("version_affected",), "request": ("scope", "due")}
CHOICE_FIELDS = {"type", "priority", "environment", "severity"}


class IssueForm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: IssueType | None = None
    priority: Priority | None = None
    title: Title | None = None
    description: LongText | None = None
    environment: Environment | None = None
    severity: Severity | None = None
    steps: LongText | None = None
    actual: LongText | None = None
    expected: LongText | None = None
    version_affected: ShortText | None = None
    background: LongText | None = None
    outcome: LongText | None = None
    acceptance: LongText | None = None
    scope: ShortText | None = None
    due: date | None = None

    @field_validator("title", "description", "steps", "actual", "expected", "version_affected",
                     "background", "outcome", "acceptance", "scope")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value and "\x00" in value:
            raise ValueError("字段包含无效字符")
        return value or None

    def missing_fields(self) -> dict[str, str]:
        required = (*COMMON_FIELDS, *REQUIRED_BY_TYPE.get(self.type, ()))
        return {
            key: f"请{'选择' if key in CHOICE_FIELDS else '填写'}{FIELD_LABELS[key]}"
            for key in required if not getattr(self, key)
        }

    def detail_values(self) -> dict[str, str]:
        keys = (*REQUIRED_BY_TYPE.get(self.type, ()), *OPTIONAL_BY_TYPE.get(self.type, ()))
        return self.model_dump(mode="json", include=set(keys), exclude_none=True)


class IssueWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(strict=True, ge=1)] | None = None
    write_id: UUID
    submit: bool
    assignee_id: Annotated[int, Field(strict=True, ge=1)] | None = None
    form: IssueForm
    keep_attachments: list[Annotated[int, Field(strict=True, ge=1)]] = Field(max_length=5)


class AttachmentInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    size: int


class IssueSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: IssueType | None
    title: str | None
    priority: Priority | None
    status: Literal["draft", "pending_claim", "pending_work", "in_progress", "pending_verify"]
    updated_at: int


class IssuePerson(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str


class IssueDetail(IssueSummary):
    version: int
    form: IssueForm
    attachments: list[AttachmentInfo]
    creator: IssuePerson
    assignee: IssuePerson | None
    feedback: str | None
    feedback_at: int | None


class IssueAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(strict=True, ge=1)]
    write_id: UUID
    action: Literal["claim", "start", "finish"]
    feedback: LongText | None = None

    @field_validator("feedback")
    @classmethod
    def validate_feedback(cls, value: str | None) -> str | None:
        return IssueForm.normalize_text(value)
