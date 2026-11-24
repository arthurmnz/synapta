from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.access_codes import normalize_access_code, validate_visibility_and_code
from app.schemas.organization import VisibilityType

OptionLetter = Literal["A", "B", "C", "D"]
RetakeStatus = Literal["none", "pending", "approved", "rejected"]


class QuestionOptions(BaseModel):
    """Multiple-choice options A through D."""

    A: str = Field(min_length=1, max_length=2000)
    B: str = Field(min_length=1, max_length=2000)
    C: str = Field(min_length=1, max_length=2000)
    D: str = Field(min_length=1, max_length=2000)

    @field_validator("A", "B", "C", "D")
    @classmethod
    def clean_option(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("As alternativas não podem ficar vazias.")
        return cleaned


class QuestionListCreate(BaseModel):
    """Payload to create a draft question list (classroom-attached or standalone)."""

    is_standalone: bool = False
    classroom_id: UUID | None = None
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    visibility: VisibilityType = "public"
    access_code: str | None = Field(default=None, max_length=64)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("O título da lista deve ter pelo menos 2 caracteres.")
        return cleaned

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_hierarchy_and_visibility(self) -> "QuestionListCreate":
        if self.is_standalone:
            if self.classroom_id is not None:
                raise ValueError("Simulado avulso não pode estar vinculado a uma turma.")
            if self.visibility != "public":
                raise ValueError("Simulado avulso deve ser sempre público.")
            self.access_code = None
            return self

        if self.classroom_id is None:
            raise ValueError("Simulado de turma exige a seleção de uma turma (classroom_id).")

        visibility, access_code = validate_visibility_and_code(self.visibility, self.access_code)
        self.visibility = visibility  # type: ignore[assignment]
        self.access_code = access_code
        return self


class QuestionListUpdate(BaseModel):
    """Payload to update metadata, classification, visibility, or publication state of a list."""

    is_standalone: bool | None = None
    classroom_id: UUID | None = None
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    is_published: bool | None = None
    visibility: VisibilityType | None = None
    access_code: str | None = Field(default=None, max_length=64)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("O título da lista deve ter pelo menos 2 caracteres.")
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


class QuestionListUnlockRequest(BaseModel):
    """Payload containing the access code to permanently unlock a private classroom list."""

    access_code: str = Field(min_length=1, max_length=64)

    @field_validator("access_code")
    @classmethod
    def clean_access_code(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Informe o código de acesso.")
        return cleaned


class QuestionCreate(BaseModel):
    """Payload to add a multiple-choice question to a list."""

    topic_id: UUID
    statement: str = Field(min_length=3, max_length=5000)
    options: QuestionOptions
    correct_option: OptionLetter
    explanation: str = Field(min_length=3, max_length=5000)
    order_index: int | None = Field(default=None, ge=1)

    @field_validator("statement", "explanation")
    @classmethod
    def clean_text(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 3:
            raise ValueError("O campo deve ter pelo menos 3 caracteres.")
        return cleaned


class QuestionUpdate(BaseModel):
    """Payload to edit an existing question."""

    topic_id: UUID | None = None
    statement: str | None = Field(default=None, min_length=3, max_length=5000)
    options: QuestionOptions | None = None
    correct_option: OptionLetter | None = None
    explanation: str | None = Field(default=None, min_length=3, max_length=5000)
    order_index: int | None = Field(default=None, ge=1)

    @field_validator("statement", "explanation")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 3:
            raise ValueError("O campo deve ter pelo menos 3 caracteres.")
        return cleaned


class TeacherQuestionOut(BaseModel):
    """Question detail visible to the owning teacher, including answer key."""

    id: UUID
    question_list_id: UUID
    topic_id: UUID
    topic_name: str
    order_index: int
    statement: str
    options: QuestionOptions
    correct_option: OptionLetter
    explanation: str


class TeacherListSummaryOut(BaseModel):
    """Summary of a question list managed by a teacher."""

    id: UUID
    classroom_id: UUID | None = None
    classroom_name: str | None = None
    organization_id: UUID | None = None
    organization_name: str | None = None
    is_standalone: bool
    visibility: VisibilityType
    access_code: str | None = None
    title: str
    description: str | None = None
    is_published: bool
    question_count: int
    submission_count: int
    created_at: datetime
    updated_at: datetime


class TeacherListDetailOut(TeacherListSummaryOut):
    """Detailed view of a question list with full questions for teachers."""

    has_submissions: bool
    questions: list[TeacherQuestionOut]


class StudentQuestionOut(BaseModel):
    """Question view exposed to students prior to submission (excludes answer key)."""

    id: UUID
    order_index: int
    topic_id: UUID
    topic_name: str
    statement: str
    options: QuestionOptions


class StudentPastSubmissionItemOut(BaseModel):
    """Compact past attempt record on a student list view."""

    submission_id: UUID
    attempt_number: int
    score_percentage: float
    correct_count: int
    total_questions: int
    has_teacher_comment: bool
    submitted_at: datetime


class StudentListSummaryOut(BaseModel):
    """Published question list summary visible to a student (never exposes access_code)."""

    id: UUID
    classroom_id: UUID | None = None
    classroom_name: str | None = None
    organization_id: UUID | None = None
    organization_name: str | None = None
    is_standalone: bool
    visibility: VisibilityType
    is_unlocked: bool
    teacher_name: str
    title: str
    description: str | None = None
    question_count: int
    attempts_used: int
    max_attempts_available_now: int
    can_attempt: bool
    retake_status: RetakeStatus
    latest_submission_id: UUID | None = None
    latest_score_percentage: float | None = None


class StudentListDetailOut(BaseModel):
    """Published question list with questions (no answer key) and attempt history."""

    id: UUID
    classroom_id: UUID | None = None
    classroom_name: str | None = None
    organization_id: UUID | None = None
    organization_name: str | None = None
    is_standalone: bool
    visibility: VisibilityType
    is_unlocked: bool
    teacher_name: str
    title: str
    description: str | None = None
    attempts_used: int
    next_attempt_number: int
    can_attempt: bool
    retake_status: RetakeStatus
    questions: list[StudentQuestionOut]
    past_submissions: list[StudentPastSubmissionItemOut]
