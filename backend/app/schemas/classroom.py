from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.access_codes import normalize_access_code, validate_visibility_and_code
from app.schemas.organization import VisibilityType


class ClassroomCreate(BaseModel):
    """Payload to create a teacher classroom, optionally inside an organization."""

    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    organization_id: UUID | None = None
    visibility: VisibilityType = "public"
    access_code: str | None = Field(default=None, max_length=64)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("O nome da turma deve ter pelo menos 2 caracteres.")
        return cleaned

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_visibility_pairing(self) -> "ClassroomCreate":
        visibility, access_code = validate_visibility_and_code(self.visibility, self.access_code)
        self.visibility = visibility  # type: ignore[assignment]
        self.access_code = access_code
        return self


class ClassroomUpdate(BaseModel):
    """Payload to update a teacher classroom."""

    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    organization_id: UUID | None = None
    visibility: VisibilityType | None = None
    access_code: str | None = Field(default=None, max_length=64)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("O nome da turma deve ter pelo menos 2 caracteres.")
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


class ClassroomEnrollRequest(BaseModel):
    """Optional access code payload when enrolling in a private classroom."""

    access_code: str | None = Field(default=None, max_length=64)

    @field_validator("access_code")
    @classmethod
    def clean_access_code(cls, value: str | None) -> str | None:
        return normalize_access_code(value)


class ClassroomRefOut(BaseModel):
    """Compact classroom reference."""

    id: UUID
    name: str
    organization_id: UUID | None = None
    organization_name: str | None = None
    visibility: VisibilityType = "public"


class TeacherClassroomOut(BaseModel):
    """Teacher-facing classroom details (exposes access_code only to the owning teacher)."""

    id: UUID
    name: str
    description: str | None = None
    organization_id: UUID | None = None
    organization_name: str | None = None
    visibility: VisibilityType
    access_code: str | None = None
    teacher_id: UUID
    teacher_name: str
    student_count: int
    list_count: int
    created_at: datetime


class StudentClassroomOut(BaseModel):
    """Enrolled classroom details for a student (never exposes access_code)."""

    id: UUID
    name: str
    description: str | None = None
    organization_id: UUID | None = None
    organization_name: str | None = None
    organization_visibility: VisibilityType | None = None
    visibility: VisibilityType
    teacher_name: str
    published_lists_count: int
    enrolled_at: datetime


class AvailableClassroomOut(BaseModel):
    """Browsable classroom with student enrollment flag (never exposes access_code)."""

    id: UUID
    name: str
    description: str | None = None
    organization_id: UUID | None = None
    organization_name: str | None = None
    organization_visibility: VisibilityType | None = None
    visibility: VisibilityType
    teacher_name: str
    student_count: int
    published_lists_count: int
    is_enrolled: bool


class EnrollmentOut(BaseModel):
    """Confirmation of student enrollment in a classroom."""

    classroom_id: UUID
    student_id: UUID
    enrolled_at: datetime
