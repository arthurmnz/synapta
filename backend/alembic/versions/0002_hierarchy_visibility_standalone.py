"""Add organizations, visibility access codes, and standalone question lists

Revision ID: 0002_hierarchy_visibility_standalone
Revises: 0001_initial_schema
Create Date: 2026-11-23 22:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002_hierarchy_standalone"
down_revision: Union[str, Sequence[str], None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_teacher_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "visibility",
            sa.String(length=20),
            server_default=sa.text("'public'"),
            nullable=False,
        ),
        sa.Column("access_code", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("visibility IN ('public', 'private')", name="ck_organizations_visibility"),
        sa.CheckConstraint(
            "((visibility = 'public' AND access_code IS NULL) "
            "OR (visibility = 'private' AND access_code IS NOT NULL AND length(btrim(access_code)) >= 4))",
            name="ck_organizations_visibility_access_code",
        ),
        sa.ForeignKeyConstraint(["owner_teacher_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_organizations_owner_teacher_id",
        "organizations",
        ["owner_teacher_id"],
        unique=False,
    )
    op.create_index("ix_organizations_visibility", "organizations", ["visibility"], unique=False)

    op.create_table(
        "organization_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("member_role", sa.String(length=20), nullable=False),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "member_role IN ('owner', 'teacher', 'student')",
            name="ck_org_memberships_member_role",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_org_memberships_org_user"),
    )
    op.create_index(
        "ix_org_memberships_organization_id",
        "organization_memberships",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        "ix_org_memberships_user_id",
        "organization_memberships",
        ["user_id"],
        unique=False,
    )

    op.add_column(
        "classrooms",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "classrooms",
        sa.Column(
            "visibility",
            sa.String(length=20),
            server_default=sa.text("'public'"),
            nullable=False,
        ),
    )
    op.add_column(
        "classrooms",
        sa.Column("access_code", sa.String(length=64), nullable=True),
    )
    op.create_foreign_key(
        "fk_classrooms_organization_id",
        "classrooms",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_classrooms_visibility",
        "classrooms",
        "visibility IN ('public', 'private')",
    )
    op.create_check_constraint(
        "ck_classrooms_visibility_access_code",
        "classrooms",
        "((visibility = 'public' AND access_code IS NULL) "
        "OR (visibility = 'private' AND access_code IS NOT NULL AND length(btrim(access_code)) >= 4))",
    )
    op.create_index("ix_classrooms_organization_id", "classrooms", ["organization_id"], unique=False)
    op.create_index("ix_classrooms_visibility", "classrooms", ["visibility"], unique=False)

    op.alter_column(
        "question_lists",
        "classroom_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.add_column(
        "question_lists",
        sa.Column("is_standalone", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "question_lists",
        sa.Column(
            "visibility",
            sa.String(length=20),
            server_default=sa.text("'public'"),
            nullable=False,
        ),
    )
    op.add_column(
        "question_lists",
        sa.Column("access_code", sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        "ck_question_lists_visibility",
        "question_lists",
        "visibility IN ('public', 'private')",
    )
    op.create_check_constraint(
        "ck_question_lists_standalone_consistency",
        "question_lists",
        "((is_standalone = true AND classroom_id IS NULL AND visibility = 'public' AND access_code IS NULL) "
        "OR (is_standalone = false AND classroom_id IS NOT NULL))",
    )
    op.create_check_constraint(
        "ck_question_lists_visibility_access_code",
        "question_lists",
        "((visibility = 'public' AND access_code IS NULL) "
        "OR (visibility = 'private' AND access_code IS NOT NULL AND length(btrim(access_code)) >= 4))",
    )
    op.create_index(
        "ix_question_lists_is_standalone",
        "question_lists",
        ["is_standalone"],
        unique=False,
    )

    op.create_table(
        "question_list_unlocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_list_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "unlocked_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["question_list_id"], ["question_lists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "question_list_id", "student_id", name="uq_question_list_unlocks_list_student"
        ),
    )
    op.create_index(
        "ix_question_list_unlocks_list_id",
        "question_list_unlocks",
        ["question_list_id"],
        unique=False,
    )
    op.create_index(
        "ix_question_list_unlocks_student_id",
        "question_list_unlocks",
        ["student_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_question_list_unlocks_student_id", table_name="question_list_unlocks")
    op.drop_index("ix_question_list_unlocks_list_id", table_name="question_list_unlocks")
    op.drop_table("question_list_unlocks")

    op.drop_index("ix_question_lists_is_standalone", table_name="question_lists")
    op.drop_constraint(
        "ck_question_lists_visibility_access_code", "question_lists", type_="check"
    )
    op.drop_constraint(
        "ck_question_lists_standalone_consistency", "question_lists", type_="check"
    )
    op.drop_constraint("ck_question_lists_visibility", "question_lists", type_="check")
    op.drop_column("question_lists", "access_code")
    op.drop_column("question_lists", "visibility")
    op.drop_column("question_lists", "is_standalone")
    op.alter_column(
        "question_lists",
        "classroom_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )

    op.drop_index("ix_classrooms_visibility", table_name="classrooms")
    op.drop_index("ix_classrooms_organization_id", table_name="classrooms")
    op.drop_constraint("ck_classrooms_visibility_access_code", "classrooms", type_="check")
    op.drop_constraint("ck_classrooms_visibility", "classrooms", type_="check")
    op.drop_constraint("fk_classrooms_organization_id", "classrooms", type_="foreignkey")
    op.drop_column("classrooms", "access_code")
    op.drop_column("classrooms", "visibility")
    op.drop_column("classrooms", "organization_id")

    op.drop_index("ix_org_memberships_user_id", table_name="organization_memberships")
    op.drop_index("ix_org_memberships_organization_id", table_name="organization_memberships")
    op.drop_table("organization_memberships")

    op.drop_index("ix_organizations_visibility", table_name="organizations")
    op.drop_index("ix_organizations_owner_teacher_id", table_name="organizations")
    op.drop_table("organizations")
