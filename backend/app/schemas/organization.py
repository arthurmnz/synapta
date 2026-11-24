from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.access_codes import normalize_access_code, validate_visibility_and_code

VisibilityType = Literal["public", "private"]
OrganizationMemberRole = Literal["owner", "teacher", "student"]


class OrganizationCreate(BaseModel):
    """Payload to create an organization owned by a teacher."""

    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    visibility: VisibilityType = "public"
    access_code: str | None = Field(default=None, max_length=64)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("O nome da organização deve ter pelo menos 2 caracteres.")
        return cleaned

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_visibility_pairing(self) -> "OrganizationCreate":
        visibility, access_code = validate_visibility_and_code(self.visibility, self.access_code)
        self.visibility = visibility  # type: ignore[assignment]
        self.access_code = access_code
        return self


class OrganizationUpdate(BaseModel):
    """Payload to update an existing organization owned by the teacher."""

    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    visibility: VisibilityType | None = None
    access_code: str | None = Field(default=None, max_length=64)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("O nome da organização deve ter pelo menos 2 caracteres.")
        return cleaned

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("access_code")
    @classmethod
    def clean_access_code(cls, value: str | None) -> str | None:
        return normalize_access_code(value)


class OrganizationJoinRequest(BaseModel):
    """Optional access code payload when joining an organization."""

    access_code: str | None = Field(default=None, max_length=64)

    @field_validator("access_code")
    @classmethod
    def clean_access_code(cls, value: str | None) -> str | None:
        return normalize_access_code(value)


class OrganizationRefOut(BaseModel):
    """Compact organization reference."""

    id: UUID
    name: str
    visibility: VisibilityType


class TeacherOrganizationOut(BaseModel):
    """Teacher-facing organization details (exposes access_code only to the owner)."""

    id: UUID
    name: str
    description: str | None = None
    visibility: VisibilityType
    is_owner: bool
    is_member: bool
    access_code: str | None = None
    owner_id: UUID
    owner_name: str
    teacher_count: int
    classroom_count: int
    student_count: int
    created_at: datetime


class StudentOrganizationOut(BaseModel):
    """Student-facing organization listing (never exposes access_code)."""

    id: UUID
    name: str
    description: str | None = None
    owner_name: str
    visibility: VisibilityType
    is_member: bool
    public_classroom_count: int
    total_classroom_count: int
    joined_at: datetime | None = None


AvailableOrganizationOut = StudentOrganizationOut


class OrganizationMembershipOut(BaseModel):
    """Confirmation of permanent membership in an organization."""

    organization_id: UUID
    user_id: UUID
    member_role: OrganizationMemberRole
    joined_at: datetime
