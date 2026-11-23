from datetime import datetime
from typing import TYPE_CHECKING
import uuid

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.classroom import Classroom, ClassroomEnrollment
    from app.models.question_list import QuestionList
    from app.models.submission import RetakeAuthorization, Submission


class User(Base):
    """Platform user representing either a student or a teacher."""

    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('student', 'teacher')", name="ck_users_role"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    classrooms_taught: Mapped[list["Classroom"]] = relationship(
        back_populates="teacher", cascade="all, delete-orphan", passive_deletes=True
    )
    enrollments: Mapped[list["ClassroomEnrollment"]] = relationship(
        back_populates="student", cascade="all, delete-orphan", passive_deletes=True
    )
    question_lists_created: Mapped[list["QuestionList"]] = relationship(
        back_populates="teacher", cascade="all, delete-orphan", passive_deletes=True
    )
    submissions: Mapped[list["Submission"]] = relationship(
        back_populates="student",
        foreign_keys="Submission.student_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    retake_requests: Mapped[list["RetakeAuthorization"]] = relationship(
        back_populates="student",
        foreign_keys="RetakeAuthorization.student_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
