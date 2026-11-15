import hashlib
import secrets
import time
from typing import Annotated

from email_validator import EmailNotValidError
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pwdlib import PasswordHash
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import AccountStatus, LoginSession, User
from .schemas import AuthErrorResponse, Credentials, CurrentUser, Registration, UserIdentity, normalize_email

router = APIRouter(prefix="/api/auth", tags=["auth"])
password_hash = PasswordHash.recommended()
dummy_hash = password_hash.hash(secrets.token_urlsafe(32))
cookie_name = "collaboration_session"
session_lifetime = 12 * 60 * 60


def get_db(request: Request):
    with request.app.state.session_factory() as db:
        yield db


Database = Annotated[Session, Depends(get_db)]
SessionCookie = Annotated[str | None, Cookie(alias=cookie_name)]


def auth_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def digest_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def can_grant_admin(request: Request, user: User) -> bool:
    return user.id in request.app.state.settings.server_operator_user_ids


def current_user_response(request: Request, user: User) -> CurrentUser:
    return CurrentUser(
        id=user.id, username=user.username, email=user.email, role=user.role,
        can_grant_admin=can_grant_admin(request, user),
    )


@router.post(
    "/register", status_code=201, response_model=UserIdentity,
    responses={
        403: {"model": AuthErrorResponse, "description": "请求来源无效"},
        409: {"model": AuthErrorResponse, "description": "用户名或邮箱已被使用"},
        422: {"model": AuthErrorResponse, "description": "注册表单校验失败"},
    },
)
def register(data: Registration, db: Database) -> User:
    user = User(
        username=data.username,
        username_key=data.username.casefold(),
        email=data.email,
        password_hash=password_hash.hash(data.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.scalar(select(User.id).where(User.username_key == user.username_key)) is not None:
            raise auth_error(409, "username_taken", "该用户名已被使用") from None
        if db.scalar(select(User.id).where(User.email == user.email)) is not None:
            raise auth_error(409, "email_taken", "该邮箱已被使用") from None
        raise
    return user


def find_user(db: Session, identifier: str) -> User | None:
    if "@" not in identifier:
        return db.scalar(select(User).where(User.username_key == identifier.casefold()))
    try:
        email = normalize_email(identifier)
    except EmailNotValidError:
        return None
    return db.scalar(select(User).where(User.email == email))


@router.post(
    "/login", response_model=CurrentUser,
    responses={
        401: {"model": AuthErrorResponse, "description": "登录凭据错误"},
        403: {"model": AuthErrorResponse, "description": "账号尚未启用、已停用或请求来源无效"},
        422: {"model": AuthErrorResponse, "description": "登录表单校验失败"},
    },
)
def login(
    data: Credentials, request: Request, response: Response, db: Database, token: SessionCookie = None,
) -> CurrentUser:
    user = find_user(db, data.identifier)
    stored_hash = user.password_hash if user is not None else dummy_hash
    if not password_hash.verify(data.password, stored_hash) or user is None:
        raise auth_error(401, "invalid_credentials", "用户名、邮箱或密码错误")
    # 与停用操作锁定同一个账号，避免停用与登录同时提交时留下可复用的会话。
    user = db.get(User, user.id, with_for_update=True, populate_existing=True)
    if user is None:
        raise auth_error(401, "invalid_credentials", "用户名、邮箱或密码错误")
    if user.status == AccountStatus.DISABLED:
        raise auth_error(403, "account_disabled", "账号已停用，请联系管理员")
    if user.status != AccountStatus.ACTIVE:
        raise auth_error(403, "account_inactive", "账号尚未启用，请联系管理员")

    now = int(time.time())
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id, LoginSession.expires_at <= now))
    if token:
        db.execute(delete(LoginSession).where(LoginSession.token_digest == digest_token(token)))
    new_token = secrets.token_urlsafe(32)
    db.add(LoginSession(token_digest=digest_token(new_token), user_id=user.id, expires_at=now + session_lifetime))
    db.commit()
    response.set_cookie(
        cookie_name, new_token, max_age=session_lifetime, httponly=True,
        secure=request.app.state.settings.secure_cookie, samesite="lax",
    )
    return current_user_response(request, user)


def get_current_user(db: Database, token: SessionCookie = None) -> User:
    if token:
        user = db.scalar(
            select(User)
            .join(LoginSession)
            .where(
                LoginSession.token_digest == digest_token(token),
                LoginSession.expires_at > int(time.time()),
                User.status == AccountStatus.ACTIVE,
            )
        )
        if user is not None:
            return user
    raise auth_error(401, "authentication_required", "请先登录")


@router.get(
    "/me", response_model=CurrentUser,
    responses={401: {"model": AuthErrorResponse, "description": "需要有效会话"}},
)
def me(request: Request, user: Annotated[User, Depends(get_current_user)]) -> CurrentUser:
    return current_user_response(request, user)


@router.post(
    "/logout", status_code=204,
    responses={403: {"model": AuthErrorResponse, "description": "请求来源无效"}},
)
def logout(request: Request, db: Database, token: SessionCookie = None) -> Response:
    if token:
        db.execute(delete(LoginSession).where(LoginSession.token_digest == digest_token(token)))
        db.commit()
    response = Response(status_code=204)
    response.delete_cookie(cookie_name, httponly=True, secure=request.app.state.settings.secure_cookie, samesite="lax")
    return response
