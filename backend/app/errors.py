from fastapi import HTTPException


def api_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def validation_error(fields: dict[str, str]) -> HTTPException:
    return HTTPException(
        422, detail={"code": "validation_error", "message": "请检查表单输入", "fields": fields},
    )
