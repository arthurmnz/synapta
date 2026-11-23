from datetime import datetime
from typing import TYPE_CHECKING
import uuid

from sqlalchemy import Boolean, CHAR, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.classroom import Classroom
    from app.models.submission import RetakeAuthorization, Submission, SubmissionAnswer
    from app.models.topic import Topic
    from app.models.user import User


class QuestionList(Base):
    """Quiz/exercise list attached to a classroom and managed by its teacher."""

    __tablename__ = "question_lists"
    __table_args__ = (
        Index("ix_question_lists_classroom_id", "classroom_id"),
        Index("ix_question_lists_teacher_id", "teacher_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    classroom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    classroom: Mapped["Classroom"] = relationship(back_populates="question_lists")
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


class Question(Base):
    """Multiple-choice (A-D) mathematics question inside a question list."""

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
