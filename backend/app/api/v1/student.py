from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_role
from app.models.user import User
from app.schemas.classroom import (
    AvailableClassroomOut,
    ClassroomEnrollRequest,
    EnrollmentOut,
    StudentClassroomOut,
)
from app.schemas.organization import (
    OrganizationJoinRequest,
    OrganizationMembershipOut,
    StudentOrganizationOut,
)
from app.schemas.question_list import (
    QuestionListUnlockRequest,
    StudentListDetailOut,
    StudentListSummaryOut,
)
from app.schemas.submission import (
    RetakeRequestCreate,
    RetakeRequestOut,
    StudentSubmissionSummaryOut,
    SubmissionCreate,
    SubmissionFeedbackOut,
)
from app.services import (
    classroom_service,
    list_service,
    organization_service,
    submission_service,
)

router = APIRouter(prefix="/student", tags=["student"])
require_student = require_role("student")


@router.get("/organizations", response_model=list[StudentOrganizationOut])
def list_organizations(
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> list[StudentOrganizationOut]:
    """List organizations visible for student discovery with membership status."""
    return organization_service.list_student_organizations(db, current_user.id)


@router.post(
    "/organizations/{org_id}/join",
    response_model=OrganizationMembershipOut,
    status_code=status.HTTP_201_CREATED,
)
def join_organization(
    org_id: UUID,
    payload: OrganizationJoinRequest | None = Body(default=None),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> OrganizationMembershipOut:
    """Join a public organization or unlock a private organization permanently."""
    access_code = payload.access_code if payload else None
    return organization_service.join_organization_as_student(
        db, org_id, current_user.id, access_code=access_code
    )


@router.get("/organizations/{org_id}/classrooms", response_model=list[AvailableClassroomOut])
def list_organization_classrooms(
    org_id: UUID,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> list[AvailableClassroomOut]:
    """List classrooms inside an organization (requires membership when organization is private)."""
    return classroom_service.list_available_classrooms(
        db, current_user.id, organization_id=org_id
    )


@router.get("/classrooms", response_model=list[StudentClassroomOut])
def list_enrolled_classrooms(
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> list[StudentClassroomOut]:
    """List classrooms in which the authenticated student is enrolled."""
    return classroom_service.list_student_enrolled_classrooms(db, current_user.id)


@router.get("/classrooms/available", response_model=list[AvailableClassroomOut])
def list_available_classrooms(
    organization_id: UUID | None = Query(default=None),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> list[AvailableClassroomOut]:
    """List discoverable classrooms respecting private organization access boundaries."""
    return classroom_service.list_available_classrooms(
        db, current_user.id, organization_id=organization_id
    )


@router.post(
    "/classrooms/{classroom_id}/enroll",
    response_model=EnrollmentOut,
    status_code=status.HTTP_201_CREATED,
)
def enroll_in_classroom(
    classroom_id: UUID,
    payload: ClassroomEnrollRequest | None = Body(default=None),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> EnrollmentOut:
    """Enroll the authenticated student in a classroom (validating access code if private)."""
    access_code = payload.access_code if payload else None
    return classroom_service.enroll_student(
        db, classroom_id, current_user.id, access_code=access_code
    )


@router.get("/lists", response_model=list[StudentListSummaryOut])
def list_student_lists(
    organization_id: UUID | None = Query(default=None),
    classroom_id: UUID | None = Query(default=None),
    scope: Literal["all", "classroom", "standalone"] = Query(default="all"),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> list[StudentListSummaryOut]:
    """List published classroom and/or standalone lists accessible to the student."""
    return list_service.list_student_lists(
        db,
        current_user.id,
        organization_id=organization_id,
        classroom_id=classroom_id,
        scope=scope,
    )


@router.get("/lists/{list_id}", response_model=StudentListDetailOut)
def get_student_list_detail(
    list_id: UUID,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> StudentListDetailOut:
    """Retrieve a published list for solving (excludes answer keys and explanations)."""
    return list_service.get_student_list_detail(db, list_id, current_user.id)


@router.post("/lists/{list_id}/unlock", response_model=StudentListDetailOut)
def unlock_student_list(
    list_id: UUID,
    payload: QuestionListUnlockRequest,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> StudentListDetailOut:
    """Permanently unlock a private classroom question list with its access code."""
    return list_service.unlock_student_list(
        db, list_id, current_user.id, access_code=payload.access_code
    )


@router.post(
    "/lists/{list_id}/submit",
    response_model=SubmissionFeedbackOut,
    status_code=status.HTTP_201_CREATED,
)
def submit_list(
    list_id: UUID,
    payload: SubmissionCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> SubmissionFeedbackOut:
    """Submit answers for a full question list and receive deterministic feedback."""
    return submission_service.submit_list(db, list_id, current_user.id, payload)


@router.get("/submissions", response_model=list[StudentSubmissionSummaryOut])
def list_student_submissions(
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> list[StudentSubmissionSummaryOut]:
    """List all submissions submitted by the authenticated student."""
    return submission_service.list_student_submissions(db, current_user.id)


@router.get("/submissions/{submission_id}", response_model=SubmissionFeedbackOut)
def get_student_submission_feedback(
    submission_id: UUID,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> SubmissionFeedbackOut:
    """Get detailed deterministic feedback and teacher comment for a submission."""
    return submission_service.get_student_submission_feedback(db, submission_id, current_user.id)


@router.post(
    "/lists/{list_id}/retake-request",
    response_model=RetakeRequestOut,
    status_code=status.HTTP_201_CREATED,
)
def request_retake(
    list_id: UUID,
    payload: RetakeRequestCreate | None = Body(default=None),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> RetakeRequestOut:
    """Request teacher authorization to retake a submitted question list."""
    return submission_service.create_retake_request(
        db,
        list_id,
        current_user.id,
        payload or RetakeRequestCreate(),
    )
