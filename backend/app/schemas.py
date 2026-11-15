from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator
from pydantic_core import PydanticCustomError


def normalize_email(value: str) -> str:
    return validate_email(value.strip(), check_deliverability=False, test_environment=True).normalized.casefold()


class Registration(BaseModel):
    model_config = ConfigDict(strict=True)

    username: str
    email: str
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        username = value.strip()
        if not username:
            raise PydanticCustomError("invalid_input", "请输入用户名")
        if len(username) > 64 or "@" in username or not username.isprintable():
            raise PydanticCustomError("invalid_input", "用户名最多 64 位，不能包含 @ 或控制字符")
        return username

    @field_validator("email")
    @classmethod
    def validate_registration_email(cls, value: str) -> str:
        if not value.strip():
            raise PydanticCustomError("invalid_input", "请输入邮箱")
        try:
            email = normalize_email(value)
        except EmailNotValidError:
            raise PydanticCustomError("invalid_input", "请输入有效的邮箱地址") from None
        if len(email) > 254:
            raise PydanticCustomError("invalid_input", "邮箱地址过长")
        return email

    @field_validator("confirm_password")
    @classmethod
    def confirm_matches(cls, value: str, info: ValidationInfo) -> str:
        if not value:
            raise PydanticCustomError("invalid_input", "请再次输入密码")
        if "password" in info.data and value != info.data["password"]:
            raise PydanticCustomError("invalid_input", "两次输入的密码不一致")
        return value


class Credentials(BaseModel):
    model_config = ConfigDict(strict=True)

    identifier: str
    password: str = Field(min_length=1, max_length=128)

    @field_validator("identifier")
    @classmethod
    def validate_identifier(cls, value: str) -> str:
        identifier = value.strip()
        if not identifier:
            raise PydanticCustomError("invalid_input", "请输入用户名或邮箱")
        if len(identifier) > 254 or not identifier.isprintable():
            raise PydanticCustomError("invalid_input", "请输入有效的用户名或邮箱")
        return identifier


class CurrentUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str


class AuthErrorDetail(BaseModel):
    code: str
    message: str
    fields: dict[str, str] | None = None


class AuthErrorResponse(BaseModel):
    detail: AuthErrorDetail
