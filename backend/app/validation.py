from collections.abc import Iterable

from pydantic_core import ErrorDetails

from .issue_schemas import FIELD_LABELS

FIELD_NAMES = {
    **FIELD_LABELS,
    "identifier": "用户名或邮箱",
    "username": "用户名",
    "email": "邮箱",
    "password": "密码",
    "confirm_password": "确认密码",
    "role": "角色",
    "status": "账号状态",
}


def validation_message(error: ErrorDetails, field: str) -> str:
    if error["type"] == "invalid_input":
        return error["msg"]
    if field == "password":
        if error["type"] == "string_too_short":
            if error.get("ctx", {}).get("min_length") == 8 and error.get("input") != "":
                return "密码至少 8 位"
            return "请输入密码"
        if error["type"] == "string_too_long":
            return "密码最多 128 位"
    return f"请填写有效的{FIELD_NAMES[field]}"


def validation_fields(errors: Iterable[ErrorDetails]) -> dict[str, str]:
    fields = {}
    for error in errors:
        if not error["loc"]:
            continue
        field = error["loc"][-1]
        if isinstance(field, str) and field in FIELD_NAMES:
            # 仅返回已知字段的提示，避免把原始输入或内部校验上下文发给浏览器。
            fields[field] = validation_message(error, field)
    return fields
