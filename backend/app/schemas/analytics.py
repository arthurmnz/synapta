from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.classroom import ClassroomRefOut
from app.schemas.question_list import RetakeStatus


class TopicMetricOut(BaseModel):
    """Aggregated accuracy metrics for a subject/topic."""

    topic_id: UUID
    topic_name: str
    total_answers: int
    correct_answers: int
    wrong_answers: int
    accuracy_percentage: float


class StandaloneListAnalyticsOut(BaseModel):
    """Aggregated performance metrics for a standalone question list."""

    list_id: UUID
    title: str
    submissions_count: int
    distinct_students_count: int
    average_score_percentage: float


class TeacherKpisOut(BaseModel):
    """High-level KPIs for the teacher dashboard."""

    total_organizations: int = 0
    total_classrooms: int
    total_students: int
    total_published_lists: int
    total_standalone_lists: int = 0
    total_submissions: int
    overall_accuracy_percentage: float
    pending_retake_requests: int


class TeacherTopicAnalyticsOut(BaseModel):
    """Topic performance analytics response for teacher dashboards and charts."""

    kpis: TeacherKpisOut
    topics: list[TopicMetricOut]
    lowest_performing_topics: list[TopicMetricOut]
    highest_performing_topics: list[TopicMetricOut]
    standalone_lists: list[StandaloneListAnalyticsOut] = Field(default_factory=list)


class TeacherStudentSummaryOut(BaseModel):
    """Student overview row for a teacher's students list."""

    student_id: UUID
    name: str
    email: str
    classrooms: list[ClassroomRefOut]
    lists_completed_count: int
    total_attempts_count: int
    standalone_submissions_count: int = 0
    average_score_percentage: float | None = None
    last_submitted_at: datetime | None = None
    has_pending_retake: bool


class TeacherStudentInfoOut(BaseModel):
    """Student identity and enrolled classrooms scoped to the teacher."""

    id: UUID
    name: str
    email: str
    classrooms: list[ClassroomRefOut]


class TeacherStudentProfileSummaryOut(BaseModel):
    """Individual student summary statistics."""

    average_score_percentage: float | None = None
    lists_completed_count: int
    total_attempts_count: int
    standalone_submissions_count: int = 0
    strongest_topic: str | None = None
    weakest_topic: str | None = None


class TeacherStudentSubmissionItemOut(BaseModel):
    """Submission entry in an individual student's teacher profile."""

    submission_id: UUID
    question_list_id: UUID
    question_list_title: str
    classroom_id: UUID | None = None
    classroom_name: str | None = None
    organization_id: UUID | None = None
    organization_name: str | None = None
    is_standalone: bool = False
    attempt_number: int
    attempts_on_list: int
    correct_count: int
    total_questions: int
    score_percentage: float
    teacher_comment: str | None = None
    retake_status: RetakeStatus
    pending_retake_request_id: UUID | None = None
    can_authorize_retake: bool
    submitted_at: datetime


class TeacherStudentDetailOut(BaseModel):
    """Complete individual student performance profile for a teacher."""

    student: TeacherStudentInfoOut
    summary: TeacherStudentProfileSummaryOut
    topic_performance: list[TopicMetricOut]
    submissions: list[TeacherStudentSubmissionItemOut]
