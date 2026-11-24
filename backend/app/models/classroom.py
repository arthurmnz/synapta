from datetime import datetime
from typing import TYPE_CHECKING
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.question_list import QuestionList
    from app.models.user import User


class Classroom(Base):
    """Classroom created by a teacher, optionally linked to an organization."""

    __tablename__ = "classrooms"
    __table_args__ = (
        CheckConstraint("visibility IN ('public', 'private')", name="ck_classrooms_visibility"),
        CheckConstraint(
            "((visibility = 'public' AND access_code IS NULL) "
            "OR (visibility = 'private' AND access_code IS NOT NULL AND length(btrim(access_code)) >= 4))",
            name="ck_classrooms_visibility_access_code",
        ),
        Index("ix_classrooms_teacher_id", "teacher_id"),
        Index("ix_classrooms_organization_id", "organization_id"),
        Index("ix_classrooms_visibility", "visibility"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'public'")
    )
    access_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    teacher: Mapped["User"] = relationship(back_populates="classrooms_taught")
    organization: Mapped["Organization | None"] = relationship(back_populates="classrooms")
    enrollments: Mapped[list["ClassroomEnrollment"]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan", passive_deletes=True
    )
    question_lists: Mapped[list["QuestionList"]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan", passive_deletes=True
    )


class ClassroomEnrollment(Base):
    """Student enrollment in a specific classroom."""

    __tablename__ = "classroom_enrollments"
    __table_args__ = (
        UniqueConstraint("classroom_id", "student_id", name="uq_classroom_enrollments_classroom_student"),
        Index("ix_enrollments_student_id", "student_id"),
        Index("ix_enrollments_classroom_id", "classroom_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    classroom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    classroom: Mapped["Classroom"] = relationship(back_populates="enrollments")
    student: Mapped["User"] = relationship(back_populates="enrollments")
