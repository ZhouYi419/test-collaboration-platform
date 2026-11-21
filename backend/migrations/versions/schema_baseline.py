"""创建当前数据库结构。"""

import sqlalchemy as sa
from alembic import op

revision = "schema_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("username_key", sa.String(192), nullable=False, unique=True),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(9), nullable=True),
        sa.Column("status", sa.String(8), server_default="pending", nullable=False),
        sa.CheckConstraint("role IN ('admin', 'tester', 'developer')", name="ck_users_role"),
        sa.CheckConstraint("status IN ('pending', 'active', 'disabled')", name="ck_users_status"),
    )
    op.create_table(
        "login_sessions",
        sa.Column("token_digest", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_login_sessions_user_id", "login_sessions", ["user_id"])
    op.create_table(
        "issues",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("creator_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assignee_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(14), nullable=False),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("feedback_at", sa.BigInteger(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("last_write_id", sa.Uuid(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.Column("type", sa.String(7), nullable=True),
        sa.Column("title", sa.String(100), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(2), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft', 'pending_claim', 'pending_work', 'in_progress', 'pending_verify', 'closed')",
            name="ck_issues_status",
        ),
        sa.CheckConstraint(
            "status = 'draft' OR (status = 'pending_claim' AND assignee_id IS NULL) "
            "OR (status IN ('pending_work', 'in_progress', 'pending_verify', 'closed') AND assignee_id IS NOT NULL)",
            name="ck_issues_assignment",
        ),
    )
    op.create_index("ix_issues_creator_updated", "issues", ["creator_id", "updated_at", "id"])
    op.create_index("ix_issues_assignee_id", "issues", ["assignee_id"])
    op.create_table(
        "issue_verifications",
        sa.Column("issue_id", sa.Uuid(), sa.ForeignKey("issues.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("issue_version", sa.Integer(), primary_key=True),
        sa.Column("tester_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("outcome", sa.String(8), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("verified_at", sa.BigInteger(), nullable=False),
        sa.Column("feedback", sa.Text(), nullable=False),
        sa.Column("feedback_at", sa.BigInteger(), nullable=False),
        sa.Column("write_id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "(outcome = 'passed' AND reason IS NULL) OR "
            "(outcome = 'returned' AND reason IS NOT NULL AND length(trim(reason)) BETWEEN 1 AND 5000)",
            name="ck_issue_verifications_outcome",
        ),
        sa.UniqueConstraint("issue_id", "write_id", name="uq_issue_verifications_write"),
    )
    op.create_table(
        "issue_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("issue_id", sa.Uuid(), sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sqlite_autoincrement=True,
    )
    op.create_index("ix_issue_attachments_issue_id", "issue_attachments", ["issue_id"])
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("issue_id", sa.Uuid(), sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("issue_version", sa.Integer(), nullable=False),
        sa.Column("recipient_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event", sa.String(8), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("read_at", sa.BigInteger(), nullable=True),
        sa.CheckConstraint(
            "event IN ('assigned', 'claimed', 'started', 'feedback', 'passed', 'returned')",
            name="ck_notifications_event",
        ),
        sa.UniqueConstraint("issue_id", "issue_version", "recipient_id", name="uq_notifications_issue_version_recipient"),
    )
    op.create_index("ix_notifications_recipient_created", "notifications", ["recipient_id", "created_at", "id"])


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("issue_attachments")
    op.drop_table("issue_verifications")
    op.drop_table("issues")
    op.drop_table("login_sessions")
    op.drop_table("users")
