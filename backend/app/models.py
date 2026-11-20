from enum import StrEnum
from uuid import UUID

from sqlalchemy import JSON, BigInteger, CheckConstraint, ForeignKey, Index, LargeBinary, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UserRole(StrEnum):
    ADMIN = "admin"
    TESTER = "tester"
    DEVELOPER = "developer"


class AccountStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    DISABLED = "disabled"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'tester', 'developer')", name="ck_users_role"),
        CheckConstraint("status IN ('pending', 'active', 'disabled')", name="ck_users_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64))
    username_key: Mapped[str] = mapped_column(String(192), unique=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str | None] = mapped_column(String(9))
    status: Mapped[str] = mapped_column(String(8), server_default=AccountStatus.PENDING.value)


class LoginSession(Base):
    __tablename__ = "login_sessions"

    token_digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[int] = mapped_column(BigInteger)


class IssueStatus(StrEnum):
    DRAFT = "draft"
    PENDING_CLAIM = "pending_claim"
    PENDING_WORK = "pending_work"
    IN_PROGRESS = "in_progress"
    PENDING_VERIFY = "pending_verify"
    CLOSED = "closed"


class Issue(Base):
    __tablename__ = "issues"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'pending_claim', 'pending_work', 'in_progress', 'pending_verify', 'closed')",
            name="ck_issues_status",
        ),
        CheckConstraint(
            "status = 'draft' OR (status = 'pending_claim' AND assignee_id IS NULL) "
            "OR (status IN ('pending_work', 'in_progress', 'pending_verify', 'closed') AND assignee_id IS NOT NULL)",
            name="ck_issues_assignment",
        ),
        Index("ix_issues_creator_updated", "creator_id", "updated_at", "id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(14))
    feedback: Mapped[str | None] = mapped_column(Text)
    feedback_at: Mapped[int | None] = mapped_column(BigInteger)
    version: Mapped[int] = mapped_column()
    last_write_id: Mapped[UUID] = mapped_column(Uuid)
    updated_at: Mapped[int] = mapped_column(BigInteger)
    type: Mapped[str | None] = mapped_column(String(7))
    title: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str | None] = mapped_column(String(2))
    details: Mapped[dict[str, str]] = mapped_column(JSON)

    __mapper_args__ = {"version_id_col": version}


class IssueVerification(Base):
    __tablename__ = "issue_verifications"
    __table_args__ = (
        CheckConstraint(
            "(outcome = 'passed' AND reason IS NULL) OR "
            "(outcome = 'returned' AND reason IS NOT NULL AND length(trim(reason)) BETWEEN 1 AND 5000)",
            name="ck_issue_verifications_outcome",
        ),
        UniqueConstraint("issue_id", "write_id", name="uq_issue_verifications_write"),
    )

    issue_id: Mapped[UUID] = mapped_column(ForeignKey("issues.id", ondelete="CASCADE"), primary_key=True)
    issue_version: Mapped[int] = mapped_column(primary_key=True)
    tester_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    outcome: Mapped[str] = mapped_column(String(8))
    reason: Mapped[str | None] = mapped_column(Text)
    verified_at: Mapped[int] = mapped_column(BigInteger)
    feedback: Mapped[str] = mapped_column(Text)
    feedback_at: Mapped[int] = mapped_column(BigInteger)
    write_id: Mapped[UUID] = mapped_column(Uuid)


class IssueAttachment(Base):
    __tablename__ = "issue_attachments"
    __table_args__ = {"sqlite_autoincrement": True}

    id: Mapped[int] = mapped_column(primary_key=True)
    issue_id: Mapped[UUID] = mapped_column(ForeignKey("issues.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    size: Mapped[int]
    content: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
