from datetime import datetime
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
    from app.models.classroom import Classroom
    from app.models.submission import RetakeAuthorization, Submission, SubmissionAnswer
    from app.models.topic import Topic
    from app.models.user import User


class QuestionList(Base):
    """Quiz/exercise list either attached to a classroom or published as a standalone exam."""

    __tablename__ = "question_lists"
    __table_args__ = (
        CheckConstraint("visibility IN ('public', 'private')", name="ck_question_lists_visibility"),
        CheckConstraint(
            "((is_standalone = true AND classroom_id IS NULL AND visibility = 'public' AND access_code IS NULL) "
            "OR (is_standalone = false AND classroom_id IS NOT NULL))",
            name="ck_question_lists_standalone_consistency",
        ),
        CheckConstraint(
            "((visibility = 'public' AND access_code IS NULL) "
            "OR (visibility = 'private' AND access_code IS NOT NULL AND length(btrim(access_code)) >= 4))",
            name="ck_question_lists_visibility_access_code",
        ),
        Index("ix_question_lists_classroom_id", "classroom_id"),
        Index("ix_question_lists_teacher_id", "teacher_id"),
        Index("ix_question_lists_is_standalone", "is_standalone"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    classroom_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=True
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    is_standalone: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    visibility: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'public'")
    )
    access_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    classroom: Mapped["Classroom | None"] = relationship(back_populates="question_lists")
    teacher: Mapped["User"] = relationship(back_populates="question_lists_created")
    questions: Mapped[list["Question"]] = relationship(
        back_populates="question_list",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Question.order_index",
    )
    submissions: Mapped[list["Submission"]] = relationship(
        back_populates="question_list", cascade="all, delete-orphan", passive_deletes=True
    )
    retake_authorizations: Mapped[list["RetakeAuthorization"]] = relationship(
        back_populates="question_list", cascade="all, delete-orphan", passive_deletes=True
    )
    unlocks: Mapped[list["QuestionListUnlock"]] = relationship(
        back_populates="question_list", cascade="all, delete-orphan", passive_deletes=True
    )


class QuestionListUnlock(Base):
    """Permanent unlock record granting a student access to a private classroom question list."""

    __tablename__ = "question_list_unlocks"
    __table_args__ = (
        UniqueConstraint("question_list_id", "student_id", name="uq_question_list_unlocks_list_student"),
        Index("ix_question_list_unlocks_list_id", "question_list_id"),
        Index("ix_question_list_unlocks_student_id", "student_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("question_lists.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    question_list: Mapped["QuestionList"] = relationship(back_populates="unlocks")
    student: Mapped["User"] = relationship(back_populates="question_list_unlocks")


class Question(Base):
    """Multiple-choice (A-D) question inside a question list."""

    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint("correct_option IN ('A', 'B', 'C', 'D')", name="ck_questions_correct_option"),
        Index("ix_questions_list_order", "question_list_id", "order_index"),
        Index("ix_questions_topic_id", "topic_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("question_lists.id", ondelete="CASCADE"), nullable=False
    )
    topic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("topics.id", ondelete="RESTRICT"), nullable=False
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    option_a: Mapped[str] = mapped_column(Text, nullable=False)
    option_b: Mapped[str] = mapped_column(Text, nullable=False)
    option_c: Mapped[str] = mapped_column(Text, nullable=False)
    option_d: Mapped[str] = mapped_column(Text, nullable=False)
    correct_option: Mapped[str] = mapped_column(CHAR(1), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    question_list: Mapped["QuestionList"] = relationship(back_populates="questions")
    topic: Mapped["Topic"] = relationship(back_populates="questions")
    submission_answers: Mapped[list["SubmissionAnswer"]] = relationship(
        back_populates="question", cascade="all, delete-orphan", passive_deletes=True
    )
