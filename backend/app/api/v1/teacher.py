from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_role
from app.models.user import User
from app.schemas.analytics import (
    TeacherStudentDetailOut,
    TeacherStudentSummaryOut,
    TeacherTopicAnalyticsOut,
)
from app.schemas.classroom import ClassroomCreate, ClassroomUpdate, TeacherClassroomOut
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationJoinRequest,
    OrganizationMembershipOut,
    OrganizationUpdate,
    TeacherOrganizationOut,
)
from app.schemas.question_list import (
    QuestionCreate,
    QuestionListCreate,
    QuestionListUpdate,
    QuestionUpdate,
    TeacherListDetailOut,
    TeacherListSummaryOut,
    TeacherQuestionOut,
)
from app.schemas.submission import (
    RetakeDecideRequest,
    RetakeRequestOut,
    SubmissionFeedbackOut,
    TeacherCommentUpdate,
)
from app.schemas.topic import TopicCreate, TopicOut
from app.services import (
    analytics_service,
    classroom_service,
    list_service,
    organization_service,
    submission_service,
)

router = APIRouter(prefix="/teacher", tags=["teacher"])
require_teacher = require_role("teacher")


@router.post("/topics", response_model=TopicOut, status_code=status.HTTP_201_CREATED)
def create_topic(
    payload: TopicCreate,
    _: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TopicOut:
    """Create a new subject/topic."""
    return classroom_service.create_topic(db, payload)


@router.get("/organizations", response_model=list[TeacherOrganizationOut])
def list_organizations(
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> list[TeacherOrganizationOut]:
    """List organizations with teacher membership status (access_code visible to owners only)."""
    return organization_service.list_teacher_organizations(db, current_user.id)


@router.post(
    "/organizations",
    response_model=TeacherOrganizationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_organization(
    payload: OrganizationCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TeacherOrganizationOut:
    """Create a new organization owned by the authenticated teacher."""
    return organization_service.create_organization(db, current_user.id, payload)


@router.patch("/organizations/{org_id}", response_model=TeacherOrganizationOut)
def update_organization(
    org_id: UUID,
    payload: OrganizationUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TeacherOrganizationOut:
    """Update an organization owned by the authenticated teacher."""
    return organization_service.update_organization(db, org_id, current_user.id, payload)


@router.delete("/organizations/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization(
    org_id: UUID,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a teacher-owned organization (detaches classrooms instead of deleting them)."""
    organization_service.delete_organization(db, org_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/organizations/{org_id}/join",
    response_model=OrganizationMembershipOut,
    status_code=status.HTTP_201_CREATED,
)
def join_organization(
    org_id: UUID,
    payload: OrganizationJoinRequest | None = Body(default=None),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> OrganizationMembershipOut:
    """Join an existing organization as an additional teacher."""
    access_code = payload.access_code if payload else None
    return organization_service.join_organization_as_teacher(
        db, org_id, current_user.id, access_code=access_code
    )


@router.get("/organizations/{org_id}/classrooms", response_model=list[TeacherClassroomOut])
def list_organization_classrooms(
    org_id: UUID,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> list[TeacherClassroomOut]:
    """List classrooms within an organization where the teacher is a member."""
    return classroom_service.list_organization_classrooms_for_teacher(
        db, org_id, current_user.id
    )


@router.get("/classrooms", response_model=list[TeacherClassroomOut])
def list_classrooms(
    organization_id: UUID | None = Query(default=None),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> list[TeacherClassroomOut]:
    """List classrooms created by the authenticated teacher."""
    return classroom_service.list_teacher_classrooms(
        db, current_user.id, organization_id=organization_id
    )


@router.post("/classrooms", response_model=TeacherClassroomOut, status_code=status.HTTP_201_CREATED)
def create_classroom(
    payload: ClassroomCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TeacherClassroomOut:
    """Create a new classroom owned by the authenticated teacher."""
    return classroom_service.create_classroom(db, current_user.id, payload)


@router.patch("/classrooms/{classroom_id}", response_model=TeacherClassroomOut)
def update_classroom(
    classroom_id: UUID,
    payload: ClassroomUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TeacherClassroomOut:
    """Update a teacher-owned classroom."""
    return classroom_service.update_classroom(db, classroom_id, current_user.id, payload)


@router.delete("/classrooms/{classroom_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_classroom(
    classroom_id: UUID,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a teacher-owned classroom."""
    classroom_service.delete_classroom(db, classroom_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/lists", response_model=list[TeacherListSummaryOut])
def list_lists(
    organization_id: UUID | None = Query(default=None),
    classroom_id: UUID | None = Query(default=None),
    list_type: Literal["all", "classroom", "standalone"] = Query(default="all"),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> list[TeacherListSummaryOut]:
    """List question lists created by the authenticated teacher."""
    return list_service.list_teacher_lists(
        db,
        current_user.id,
        organization_id=organization_id,
        classroom_id=classroom_id,
        list_type=list_type,
    )


@router.post("/lists", response_model=TeacherListDetailOut, status_code=status.HTTP_201_CREATED)
def create_list(
    payload: QuestionListCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TeacherListDetailOut:
    """Create a new draft question list (classroom-attached or standalone)."""
    return list_service.create_teacher_list(db, current_user.id, payload)


@router.get("/lists/{list_id}", response_model=TeacherListDetailOut)
def get_list_detail(
    list_id: UUID,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TeacherListDetailOut:
    """Get full details and questions of a teacher-owned list."""
    return list_service.get_teacher_list_detail(db, list_id, current_user.id)


@router.patch("/lists/{list_id}", response_model=TeacherListDetailOut)
def update_list(
    list_id: UUID,
    payload: QuestionListUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TeacherListDetailOut:
    """Update metadata, classification, visibility, or publication state of a question list."""
    return list_service.update_teacher_list(db, list_id, current_user.id, payload)


@router.delete("/lists/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_list(
    list_id: UUID,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a teacher-owned question list."""
    list_service.delete_teacher_list(db, list_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/lists/{list_id}/questions",
    response_model=TeacherQuestionOut,
    status_code=status.HTTP_201_CREATED,
)
def add_question(
    list_id: UUID,
    payload: QuestionCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TeacherQuestionOut:
    """Add a multiple-choice question to a teacher-owned list."""
    return list_service.add_question(db, list_id, current_user.id, payload)


@router.patch("/questions/{question_id}", response_model=TeacherQuestionOut)
def update_question(
    question_id: UUID,
    payload: QuestionUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TeacherQuestionOut:
    """Edit an existing question."""
    return list_service.update_question(db, question_id, current_user.id, payload)


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(
    question_id: UUID,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a question from a list without submissions."""
    list_service.delete_question(db, question_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/analytics/topics", response_model=TeacherTopicAnalyticsOut)
def get_topic_analytics(
    organization_id: UUID | None = Query(default=None),
    classroom_id: UUID | None = Query(default=None),
    list_id: UUID | None = Query(default=None),
    list_type: Literal["all", "classroom", "standalone"] = Query(default="all"),
    scope: Literal["latest", "all"] = Query(default="latest"),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TeacherTopicAnalyticsOut:
    """Return KPIs, topic accuracy analytics, and standalone list metrics."""
    return analytics_service.get_teacher_topic_analytics(
        db,
        current_user.id,
        organization_id=organization_id,
        classroom_id=classroom_id,
        list_id=list_id,
        list_type=list_type,
        scope=scope,
    )


@router.get("/students", response_model=list[TeacherStudentSummaryOut])
def list_students(
    organization_id: UUID | None = Query(default=None),
    classroom_id: UUID | None = Query(default=None),
    list_id: UUID | None = Query(default=None),
    list_type: Literal["all", "classroom", "standalone"] = Query(default="all"),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> list[TeacherStudentSummaryOut]:
    """List students enrolled in teacher classrooms or participating in standalone lists."""
    return analytics_service.list_teacher_students(
        db,
        current_user.id,
        organization_id=organization_id,
        classroom_id=classroom_id,
        list_id=list_id,
        list_type=list_type,
    )


@router.get("/students/{student_id}", response_model=TeacherStudentDetailOut)
def get_student_detail(
    student_id: UUID,
    organization_id: UUID | None = Query(default=None),
    classroom_id: UUID | None = Query(default=None),
    list_id: UUID | None = Query(default=None),
    list_type: Literal["all", "classroom", "standalone"] = Query(default="all"),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TeacherStudentDetailOut:
    """Return individual student topic performance and submission history."""
    return analytics_service.get_teacher_student_detail(
        db,
        current_user.id,
        student_id,
        organization_id=organization_id,
        classroom_id=classroom_id,
        list_id=list_id,
        list_type=list_type,
    )


@router.get("/submissions/{submission_id}", response_model=SubmissionFeedbackOut)
def get_submission_detail(
    submission_id: UUID,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> SubmissionFeedbackOut:
    """View detailed feedback for a student submission on a teacher-owned list."""
    return submission_service.get_teacher_submission_feedback(db, submission_id, current_user.id)


@router.patch("/submissions/{submission_id}/comment", response_model=SubmissionFeedbackOut)
def update_submission_comment(
    submission_id: UUID,
    payload: TeacherCommentUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> SubmissionFeedbackOut:
    """Add, update, or remove a manual pedagogical comment on a submission."""
    return submission_service.update_teacher_comment(db, submission_id, current_user.id, payload)


@router.get("/retake-requests", response_model=list[RetakeRequestOut])
def list_retake_requests(
    status_filter: str = Query(default="pending", alias="status"),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> list[RetakeRequestOut]:
    """List retake authorization requests for teacher-owned lists."""
    return submission_service.list_teacher_retake_requests(
        db, current_user.id, status_filter=status_filter
    )


@router.post("/retake-requests/{request_id}/decide", response_model=RetakeRequestOut)
def decide_retake_request(
    request_id: UUID,
    payload: RetakeDecideRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> RetakeRequestOut:
    """Approve or reject a pending student retake request."""
    return submission_service.decide_retake_request(db, request_id, current_user.id, payload)


@router.post(
    "/lists/{list_id}/students/{student_id}/authorize-retake",
    response_model=RetakeRequestOut,
)
def authorize_retake(
    list_id: UUID,
    student_id: UUID,
    _: dict | None = Body(default=None),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> RetakeRequestOut:
    """Proactively authorize a student retake or approve an existing pending request."""
    return submission_service.authorize_retake_proactively(
        db, list_id, student_id, current_user.id
    )
