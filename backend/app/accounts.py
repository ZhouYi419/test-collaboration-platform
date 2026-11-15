import argparse

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from .config import Settings
from .models import User


def main() -> None:
    parser = argparse.ArgumentParser(description="启用已注册的账号")
    parser.add_argument("action", choices=["enable"])
    parser.add_argument("username", help="注册时填写的用户名")
    args = parser.parse_args()

    engine = create_engine(Settings.from_env().database_url, poolclass=NullPool)
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.username_key == args.username.strip().casefold()))
        if user is None:
            parser.exit(1, "未找到该账号\n")
        user.is_active = True
        db.commit()
        print("账号已启用")


if __name__ == "__main__":
    main()
