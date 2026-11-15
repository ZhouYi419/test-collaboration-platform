import argparse

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from .config import Settings
from .models import AccountStatus, User, UserRole


def main() -> None:
    parser = argparse.ArgumentParser(description="启用账号并返回账号 ID")
    parser.add_argument("action", choices=["enable"])
    parser.add_argument("username", help="注册时填写的用户名")
    parser.add_argument("--role", choices=[UserRole.TESTER.value, UserRole.DEVELOPER.value],
                        help="启用尚未分配角色的普通账号时指定")
    args = parser.parse_args()
    engine = create_engine(Settings.from_env().database_url, poolclass=NullPool)
    with Session(engine) as db:
        user = db.scalar(
            select(User).where(User.username_key == args.username.strip().casefold()).with_for_update()
        )
        if user is None:
            parser.exit(1, "未找到该账号\n")
        if user.role is None:
            if args.role is None:
                parser.exit(1, "启用前请用 --role tester 或 --role developer 指定角色\n")
            user.role = args.role
        elif args.role and args.role != user.role:
            parser.exit(1, "账号已有不同角色，请在账号管理页修改\n")
        user.status = AccountStatus.ACTIVE
        db.commit()
        print(f"账号已启用，账号 ID 为 {user.id}")


if __name__ == "__main__":
    main()
