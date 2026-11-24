from datetime import datetime
from typing import TYPE_CHECKING
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.classroom import Classroom
    from app.models.user import User


class Organization(Base):
    """Institution or organization grouping teachers and classrooms with optional access code."""

    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint("visibility IN ('public', 'private')", name="ck_organizations_visibility"),
        CheckConstraint(
            "((visibility = 'public' AND access_code IS NULL) "
            "OR (visibility = 'private' AND access_code IS NOT NULL AND length(btrim(access_code)) >= 4))",
            name="ck_organizations_visibility_access_code",
        ),
        Index("ix_organizations_owner_teacher_id", "owner_teacher_id"),
        Index("ix_organizations_visibility", "visibility"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
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
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    owner_teacher: Mapped["User"] = relationship(back_populates="organizations_owned")
    memberships: Mapped[list["OrganizationMembership"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan", passive_deletes=True
    )
    classrooms: Mapped[list["Classroom"]] = relationship(
        back_populates="organization", passive_deletes="all"
    )


class OrganizationMembership(Base):
    """Permanent membership of a teacher or student in an organization."""

    __tablename__ = "organization_memberships"
    __table_args__ = (
        CheckConstraint(
            "member_role IN ('owner', 'teacher', 'student')",
            name="ck_org_memberships_member_role",
        ),
        UniqueConstraint("organization_id", "user_id", name="uq_org_memberships_org_user"),
        Index("ix_org_memberships_organization_id", "organization_id"),
        Index("ix_org_memberships_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    member_role: Mapped[str] = mapped_column(String(20), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    organization: Mapped["Organization"] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(back_populates="organization_memberships")
