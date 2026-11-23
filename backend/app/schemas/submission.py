from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.analytics import TopicMetricOut
from app.schemas.question_list import OptionLetter, QuestionOptions, RetakeStatus

PerformanceBand = Literal["excellent", "good", "attention", "critical"]
RetakeRecordStatus = Literal["pending", "approved", "rejected", "consumed"]


class AnswerSubmitItem(BaseModel):
    """Single multiple-choice answer submitted by a student."""

    question_id: UUID
    selected_option: OptionLetter


class SubmissionCreate(BaseModel):
    """Full list submission payload."""

    answers: list[AnswerSubmitItem] = Field(min_length=1)


class TeacherCommentUpdate(BaseModel):
    """Payload to set or clear a manual teacher comment on a submission."""

    teacher_comment: str | None = Field(default=None, max_length=4000)

    @field_validator("teacher_comment")
    @classmethod
    def clean_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class RetakeRequestCreate(BaseModel):
    """Optional student justification when requesting a retake."""

    reason: str | None = Field(default=None, max_length=1000)

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class RetakeDecideRequest(BaseModel):
    """Teacher decision on a pending retake request."""

    decision: Literal["approved", "rejected"]


class QuestionFeedbackOut(BaseModel):
    """Question-level deterministic correction feedback after submission."""

    question_id: UUID
    order_index: int
    topic_id: UUID
    topic_name: str
    statement: str
    options: QuestionOptions
    selected_option: OptionLetter
    correct_option: OptionLetter
    is_correct: bool
    explanation: str


class SubmissionFeedbackOut(BaseModel):
    """Full feedback view for a submission, shared between student and teacher."""

    submission_id: UUID
    question_list_id: UUID
    question_list_title: str
    classroom_id: UUID
    classroom_name: str
    student_id: UUID
    student_name: str
    student_email: str
    attempt_number: int
    attempts_used_total: int
    correct_count: int
    total_questions: int
    score_percentage: float
    performance_band: PerformanceBand
    teacher_comment: str | None = None
    teacher_commented_at: datetime | None = None
    retake_status: RetakeStatus
    pending_retake_request_id: UUID | None = None
    can_authorize_retake: bool
    can_attempt: bool
    submitted_at: datetime
    topic_breakdown: list[TopicMetricOut]
    questions_feedback: list[QuestionFeedbackOut]


class StudentSubmissionSummaryOut(BaseModel):
    """Submission history item for a student."""

    submission_id: UUID
    question_list_id: UUID
    question_list_title: str
    classroom_id: UUID
    classroom_name: str
    attempt_number: int
    attempts_used_total: int
    correct_count: int
    total_questions: int
    score_percentage: float
    performance_band: PerformanceBand
    has_teacher_comment: bool
    retake_status: RetakeStatus
    can_attempt: bool
    submitted_at: datetime


class RetakeRequestOut(BaseModel):
    """Retake request or authorization details."""

    id: UUID
    question_list_id: UUID
    question_list_title: str
    classroom_id: UUID
    classroom_name: str
    student_id: UUID
    student_name: str
    student_email: str
    attempts_used: int
    last_score_percentage: float
    status: RetakeRecordStatus
    request_reason: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None
