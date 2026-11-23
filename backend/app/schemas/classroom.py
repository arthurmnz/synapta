from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ClassroomCreate(BaseModel):
    """Payload to create a teacher classroom."""

    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)

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


class ClassroomUpdate(BaseModel):
    """Payload to update a teacher classroom."""

    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)

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


class ClassroomRefOut(BaseModel):
    """Compact classroom reference."""

    id: UUID
    name: str


class TeacherClassroomOut(BaseModel):
    """Teacher-facing classroom details with aggregate counts."""

    id: UUID
    name: str
    description: str | None = None
    student_count: int
    list_count: int
    created_at: datetime


class StudentClassroomOut(BaseModel):
    """Enrolled classroom details for a student."""

    id: UUID
    name: str
    description: str | None = None
    teacher_name: str
    published_lists_count: int
    enrolled_at: datetime


class AvailableClassroomOut(BaseModel):
    """Publicly browsable classroom with student enrollment flag."""

    id: UUID
    name: str
    description: str | None = None
    teacher_name: str
    student_count: int
    published_lists_count: int
    is_enrolled: bool


class EnrollmentOut(BaseModel):
    """Confirmation of student enrollment in a classroom."""

    classroom_id: UUID
    student_id: UUID
    enrolled_at: datetime
