from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
import uuid

from sqlalchemy import (
    Boolean,
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.question_list import Question, QuestionList
    from app.models.user import User


class Submission(Base):
    """Completed attempt of a question list submitted by a student."""

    __tablename__ = "submissions"
    __table_args__ = (
        CheckConstraint("attempt_number >= 1", name="ck_submissions_attempt_number"),
        CheckConstraint("correct_count >= 0", name="ck_submissions_correct_count"),
        CheckConstraint("total_questions >= 1", name="ck_submissions_total_questions"),
        CheckConstraint(
            "score_percentage >= 0 AND score_percentage <= 100",
            name="ck_submissions_score_percentage",
        ),
        UniqueConstraint("question_list_id", "student_id", "attempt_number", name="uq_submissions_list_student_attempt"),
        Index("ix_submissions_student_list", "student_id", "question_list_id"),
        Index("ix_submissions_list_id", "question_list_id"),
        Index("ix_submissions_submitted_at", "submitted_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("question_lists.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    score_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    teacher_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_commented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    teacher_commented_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    question_list: Mapped["QuestionList"] = relationship(back_populates="submissions")
    student: Mapped["User"] = relationship(
        back_populates="submissions", foreign_keys=[student_id]
    )
    commented_by_teacher: Mapped["User | None"] = relationship(foreign_keys=[teacher_commented_by])
    answers: Mapped[list["SubmissionAnswer"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan", passive_deletes=True
    )


class SubmissionAnswer(Base):
    """Student answer for a single question within a submission."""

    __tablename__ = "submission_answers"
    __table_args__ = (
        CheckConstraint("selected_option IN ('A', 'B', 'C', 'D')", name="ck_submission_answers_selected_option"),
        UniqueConstraint("submission_id", "question_id", name="uq_submission_answers_submission_question"),
        Index("ix_submission_answers_submission_id", "submission_id"),
        Index("ix_submission_answers_question_id", "question_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    selected_option: Mapped[str] = mapped_column(CHAR(1), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)

    submission: Mapped["Submission"] = relationship(back_populates="answers")
    question: Mapped["Question"] = relationship(back_populates="submission_answers")


class RetakeAuthorization(Base):
    """Authorization tracking student requests and teacher approvals for retaking a list."""

    __tablename__ = "retake_authorizations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'consumed')",
            name="ck_retake_authorizations_status",
        ),
        Index(
            "uq_retake_active_per_student_list",
            "question_list_id",
            "student_id",
            unique=True,
            postgresql_where=text("status IN ('pending', 'approved')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("question_lists.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    requested_by_student: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    request_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by_teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    question_list: Mapped["QuestionList"] = relationship(back_populates="retake_authorizations")
    student: Mapped["User"] = relationship(
        back_populates="retake_requests", foreign_keys=[student_id]
    )
    reviewed_by_teacher: Mapped["User | None"] = relationship(foreign_keys=[reviewed_by_teacher_id])
