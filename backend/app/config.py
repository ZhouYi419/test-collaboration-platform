import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    secure_cookie: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=os.getenv(
                "DATABASE_URL",
                "postgresql+psycopg://collaboration:collaboration@127.0.0.1:5432/collaboration",
            ),
            secure_cookie=os.getenv("SECURE_COOKIE", "").lower() in {"1", "true"},
        )
