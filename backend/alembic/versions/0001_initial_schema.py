"""Initial Synapta schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-23 14:22:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("role IN ('student', 'teacher')", name="ck_users_role"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    op.create_table(
        "topics",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("slug"),
    )

    op.create_table(
        "classrooms",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("teacher_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_classrooms_teacher_id", "classrooms", ["teacher_id"], unique=False)

    op.create_table(
        "classroom_enrollments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("classroom_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("classroom_id", "student_id", name="uq_classroom_enrollments_classroom_student"),
    )
    op.create_index("ix_enrollments_classroom_id", "classroom_enrollments", ["classroom_id"], unique=False)
    op.create_index("ix_enrollments_student_id", "classroom_enrollments", ["student_id"], unique=False)

    op.create_table(
        "question_lists",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("classroom_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("teacher_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_published", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_question_lists_classroom_id", "question_lists", ["classroom_id"], unique=False)
    op.create_index("ix_question_lists_teacher_id", "question_lists", ["teacher_id"], unique=False)

    op.create_table(
        "questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_list_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("topic_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_index", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("option_a", sa.Text(), nullable=False),
        sa.Column("option_b", sa.Text(), nullable=False),
        sa.Column("option_c", sa.Text(), nullable=False),
        sa.Column("option_d", sa.Text(), nullable=False),
        sa.Column("correct_option", sa.CHAR(length=1), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("correct_option IN ('A', 'B', 'C', 'D')", name="ck_questions_correct_option"),
        sa.ForeignKeyConstraint(["question_list_id"], ["question_lists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_questions_list_order", "questions", ["question_list_id", "order_index"], unique=False)
    op.create_index("ix_questions_topic_id", "questions", ["topic_id"], unique=False)

    op.create_table(
        "submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_list_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("correct_count", sa.Integer(), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column("score_percentage", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("teacher_comment", sa.Text(), nullable=True),
        sa.Column("teacher_commented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("teacher_commented_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("attempt_number >= 1", name="ck_submissions_attempt_number"),
        sa.CheckConstraint("correct_count >= 0", name="ck_submissions_correct_count"),
        sa.CheckConstraint("total_questions >= 1", name="ck_submissions_total_questions"),
        sa.CheckConstraint(
            "score_percentage >= 0 AND score_percentage <= 100",
            name="ck_submissions_score_percentage",
        ),
        sa.ForeignKeyConstraint(["question_list_id"], ["question_lists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["teacher_commented_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("question_list_id", "student_id", "attempt_number", name="uq_submissions_list_student_attempt"),
    )
    op.create_index("ix_submissions_list_id", "submissions", ["question_list_id"], unique=False)
    op.create_index("ix_submissions_student_list", "submissions", ["student_id", "question_list_id"], unique=False)
    op.create_index("ix_submissions_submitted_at", "submissions", ["submitted_at"], unique=False)

    op.create_table(
        "submission_answers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("selected_option", sa.CHAR(length=1), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.CheckConstraint("selected_option IN ('A', 'B', 'C', 'D')", name="ck_submission_answers_selected_option"),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("submission_id", "question_id", name="uq_submission_answers_submission_question"),
    )
    op.create_index("ix_submission_answers_question_id", "submission_answers", ["question_id"], unique=False)
    op.create_index("ix_submission_answers_submission_id", "submission_answers", ["submission_id"], unique=False)

    op.create_table(
        "retake_authorizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_list_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("requested_by_student", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("request_reason", sa.Text(), nullable=True),
        sa.Column("reviewed_by_teacher_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'consumed')",
            name="ck_retake_authorizations_status",
        ),
        sa.ForeignKeyConstraint(["question_list_id"], ["question_lists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by_teacher_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_retake_active_per_student_list",
        "retake_authorizations",
        ["question_list_id", "student_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('pending', 'approved')"),
    )


def downgrade() -> None:
    op.drop_index("uq_retake_active_per_student_list", table_name="retake_authorizations")
    op.drop_table("retake_authorizations")
    op.drop_index("ix_submission_answers_submission_id", table_name="submission_answers")
    op.drop_index("ix_submission_answers_question_id", table_name="submission_answers")
    op.drop_table("submission_answers")
    op.drop_index("ix_submissions_submitted_at", table_name="submissions")
    op.drop_index("ix_submissions_student_list", table_name="submissions")
    op.drop_index("ix_submissions_list_id", table_name="submissions")
    op.drop_table("submissions")
    op.drop_index("ix_questions_topic_id", table_name="questions")
    op.drop_index("ix_questions_list_order", table_name="questions")
    op.drop_table("questions")
    op.drop_index("ix_question_lists_teacher_id", table_name="question_lists")
    op.drop_index("ix_question_lists_classroom_id", table_name="question_lists")
    op.drop_table("question_lists")
    op.drop_index("ix_enrollments_student_id", table_name="classroom_enrollments")
    op.drop_index("ix_enrollments_classroom_id", table_name="classroom_enrollments")
    op.drop_table("classroom_enrollments")
    op.drop_index("ix_classrooms_teacher_id", table_name="classrooms")
    op.drop_table("classrooms")
    op.drop_table("topics")
    op.drop_table("users")
