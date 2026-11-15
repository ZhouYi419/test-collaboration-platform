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


def downgrade() -> None:
    op.drop_table("login_sessions")
    op.drop_table("users")
