from codecs import BOM_UTF16_BE, BOM_UTF16_LE
from dataclasses import dataclass
from pathlib import PurePosixPath

from fastapi import HTTPException, Request
from pydantic import ValidationError
from python_multipart.exceptions import MultipartParseError
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from .errors import api_error, validation_error
from .issue_schemas import IssueWrite
from .validation import validation_fields

MAX_FILES = 5
MAX_FILE_SIZE = 10_000_000
MAX_REQUEST_SIZE = MAX_FILES * MAX_FILE_SIZE + 256_000
SIGNATURES = {".png": b"\x89PNG\r\n\x1a\n", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff", ".pdf": b"%PDF-"}


def attachment_error(message: str) -> HTTPException:
    return validation_error({"attachments": message})


def is_supported_file(name: str, content: bytes) -> bool:
    extension = PurePosixPath(name).suffix.lower()
    if extension in SIGNATURES:
        return content.startswith(SIGNATURES[extension])
    if extension in {".txt", ".log"}:
        encodings = ("utf-16",) if content.startswith((BOM_UTF16_LE, BOM_UTF16_BE)) else ("utf-8-sig", "gb18030")
        for encoding in encodings:
            try:
                return "\x00" not in content.decode(encoding)
            except UnicodeDecodeError:
                continue
    return False


@dataclass
class Submission:
    data: IssueWrite
    attachments: list[tuple[str, bytes]]


async def parse_submission(request: Request) -> Submission:
    async def limited_stream():
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_REQUEST_SIZE:
                raise MultiPartException("提交内容超过大小限制")
            yield chunk

    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "multipart/form-data":
        raise api_error(415, "unsupported_media_type", "请使用表单上传")
    try:
        form = await MultiPartParser(
            request.headers, limited_stream(), max_files=MAX_FILES, max_fields=1, max_part_size=256_000,
        ).parse()
    except (MultiPartException, MultipartParseError) as exc:
        raise attachment_error("无法读取上传表单。每条事项最多 5 个附件，每个最大 10 MB。") from exc

    try:
        if any(key not in {"data", "files"} for key in form):
            raise validation_error({})
        payload = form.get("data")
        if not isinstance(payload, str):
            raise validation_error({})
        try:
            data = IssueWrite.model_validate_json(payload)
        except ValidationError as exc:
            raise validation_error(validation_fields(exc.errors())) from exc
        files = form.getlist("files")
        keep = set(data.keep_attachments)
        if len(keep) != len(data.keep_attachments) or len(keep) + len(files) > MAX_FILES:
            raise attachment_error("每条事项最多添加 5 个附件。")
        attachments = []
        for file in files:
            if not isinstance(file, UploadFile) or not file.filename:
                raise attachment_error("请选择有效的附件。")
            name = file.filename.replace("\\", "/").rsplit("/", 1)[-1]
            if not name.strip() or len(name) > 255 or any(ord(char) < 32 for char in name):
                raise attachment_error("附件名称无效或超过 255 个字符。")
            content = await file.read(MAX_FILE_SIZE + 1)
            if len(content) > MAX_FILE_SIZE:
                raise attachment_error(f"{name} 超过 10 MB。")
            if not is_supported_file(name, content):
                raise attachment_error(f"{name} 的格式或内容无效。")
            attachments.append((name, content))
        return Submission(data, attachments)
    finally:
        await form.close()
