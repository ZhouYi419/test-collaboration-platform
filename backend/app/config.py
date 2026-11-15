import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    secure_cookie: bool = False
    server_operator_user_ids: frozenset[int] = frozenset()

    @classmethod
    def from_env(cls) -> "Settings":
        entries = os.getenv("SERVER_OPERATOR_USER_IDS", "").strip()
        try:
            operator_ids = frozenset(int(entry.strip()) for entry in entries.split(",")) if entries else frozenset()
            if any(user_id < 1 for user_id in operator_ids):
                raise ValueError
        except ValueError:
            raise ValueError("SERVER_OPERATOR_USER_IDS 必须是逗号分隔的正整数账号 ID") from None
        return cls(
            database_url=os.getenv(
                "DATABASE_URL",
                "postgresql+psycopg://collaboration:collaboration@127.0.0.1:5432/collaboration",
            ),
            secure_cookie=os.getenv("SECURE_COOKIE", "").lower() in {"1", "true"},
            server_operator_user_ids=operator_ids,
        )
