from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import delete, select

from .auth import can_grant_admin, get_current_user
from .database import Database
from .errors import api_error
from .models import AccountStatus, LoginSession, User, UserRole
from .schemas import AccountPage, AccountUpdate, AuthErrorResponse, ManagedAccount

router = APIRouter(
    prefix="/api/admin", tags=["admin"],
    responses={
        401: {"model": AuthErrorResponse, "description": "需要有效会话"},
        403: {"model": AuthErrorResponse, "description": "没有操作权限或请求来源无效"},
        422: {"model": AuthErrorResponse, "description": "参数校验失败"},
    },
)
page_size = 20
PageNumber = Annotated[int, Query(ge=1, le=1_000_000)]


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> None:
    if user.role != UserRole.ADMIN:
        raise api_error(403, "admin_required", "仅管理员可访问账号管理")


def require_server_operator(request: Request, user: Annotated[User, Depends(get_current_user)]) -> None:
    if not can_grant_admin(request, user):
        raise api_error(403, "server_operator_required", "此页面需要服务器操作权限")


@router.get("/accounts", response_model=AccountPage, dependencies=[Depends(require_admin)])
@router.get("/authorizations", response_model=AccountPage, dependencies=[Depends(require_server_operator)])
def list_accounts(db: Database, page: PageNumber = 1) -> AccountPage:
    accounts = db.scalars(
        select(User).order_by(User.id.desc()).offset((page - 1) * page_size).limit(page_size + 1)
    ).all()
    return AccountPage(
        items=[ManagedAccount.model_validate(user) for user in accounts[:page_size]],
        has_next=len(accounts) > page_size,
    )


def lock_account(db: Database, account_id: int) -> User:
    user = db.get(User, account_id, with_for_update=True, populate_existing=True)
    if user is None:
        raise api_error(404, "account_not_found", "未找到该账号")
    return user


@router.put(
    "/authorizations/{account_id}", response_model=ManagedAccount,
    dependencies=[Depends(require_server_operator)],
    responses={404: {"model": AuthErrorResponse, "description": "账号不存在"}},
)
def grant_admin(account_id: int, db: Database) -> User:
    user = lock_account(db, account_id)
    user.role = UserRole.ADMIN
    user.status = AccountStatus.ACTIVE
    db.commit()
    return user


@router.patch(
    "/accounts/{account_id}", response_model=ManagedAccount, dependencies=[Depends(require_admin)],
    responses={
        404: {"model": AuthErrorResponse, "description": "账号不存在"},
        409: {"model": AuthErrorResponse, "description": "账号状态或角色冲突"},
    },
)
def update_account(account_id: int, data: AccountUpdate, db: Database) -> User:
    user = lock_account(db, account_id)
    if user.role == UserRole.ADMIN:
        raise api_error(403, "admin_account_protected", "管理员账号由服务操作人员维护")

    if data.role is not None:
        user.role = data.role
    if data.status == AccountStatus.ACTIVE and user.role is None:
        raise api_error(409, "role_required", "启用前请选择测试或开发角色")
    if data.status is not None:
        user.status = data.status
    if data.status == AccountStatus.DISABLED:
        db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    db.commit()
    return user
