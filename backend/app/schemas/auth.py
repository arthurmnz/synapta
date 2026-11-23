from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    """Payload to register a new student or teacher account."""

    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["student", "teacher"]

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("O nome deve ter pelo menos 2 caracteres.")
        return cleaned

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class LoginRequest(BaseModel):
    """Payload for email and password authentication."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class UserOut(BaseModel):
    """Public user profile returned by authentication endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: str
    role: Literal["student", "teacher"]
    created_at: datetime


class TokenResponse(BaseModel):
    """JWT authentication response with embedded user details."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut
