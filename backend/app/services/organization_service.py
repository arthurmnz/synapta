from collections import defaultdict
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import case, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.access_codes import apply_visibility_update, validate_visibility_and_code, verify_access_code
from app.core.exceptions import APIError
from app.models.classroom import Classroom, ClassroomEnrollment
from app.models.organization import Organization, OrganizationMembership
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationMembershipOut,
    OrganizationMemberRole,
    OrganizationUpdate,
    StudentOrganizationOut,
    TeacherOrganizationOut,
    VisibilityType,
)


def get_organization_or_404(db: Session, org_id: UUID) -> Organization:
    """Fetch an organization or raise 404."""
    org = db.scalar(
        select(Organization)
        .options(joinedload(Organization.owner_teacher))
        .where(Organization.id == org_id)
    )
    if org is None:
        raise APIError(
            status_code=404,
            detail="Organização não encontrada.",
            code="ORGANIZATION_NOT_FOUND",
        )
    return org


def get_owned_organization(db: Session, org_id: UUID, teacher_id: UUID) -> Organization:
    """Fetch an organization and enforce owner teacher permissions."""
    org = get_organization_or_404(db, org_id)
    if org.owner_teacher_id != teacher_id:
        raise APIError(
            status_code=403,
            detail="Apenas o professor criador pode alterar ou excluir esta organização.",
            code="FORBIDDEN_ORGANIZATION",
        )
    return org


def require_organization_membership(
    db: Session,
    org_id: UUID,
    user_id: UUID,
    *,
    allowed_roles: tuple[str, ...] | None = None,
    error_code: str = "ORGANIZATION_ACCESS_REQUIRED",
    error_detail: str = "Você precisa ser membro desta organização para acessar este recurso.",
) -> OrganizationMembership:
    """Verify organization exists and caller holds an OrganizationMembership."""
    get_organization_or_404(db, org_id)
    stmt = select(OrganizationMembership).where(
        OrganizationMembership.organization_id == org_id,
        OrganizationMembership.user_id == user_id,
    )
    if allowed_roles is not None:
        stmt = stmt.where(OrganizationMembership.member_role.in_(allowed_roles))
    membership = db.scalar(stmt)
    if membership is None:
        raise APIError(status_code=403, detail=error_detail, code=error_code)
    return membership


def _compute_org_student_counts(db: Session, org_ids: list[UUID]) -> dict[UUID, int]:
    """Count distinct students associated via org membership or classroom enrollment."""
    if not org_ids:
        return {}
    students_by_org: dict[UUID, set[UUID]] = defaultdict(set)

    member_rows = db.execute(
        select(OrganizationMembership.organization_id, OrganizationMembership.user_id).where(
            OrganizationMembership.organization_id.in_(org_ids),
            OrganizationMembership.member_role == "student",
        )
    ).all()
    for org_id, user_id in member_rows:
        students_by_org[org_id].add(user_id)

    enrolled_rows = db.execute(
        select(Classroom.organization_id, ClassroomEnrollment.student_id)
        .join(ClassroomEnrollment, ClassroomEnrollment.classroom_id == Classroom.id)
        .where(Classroom.organization_id.in_(org_ids))
    ).all()
    for org_id, student_id in enrolled_rows:
        if org_id is not None:
            students_by_org[org_id].add(student_id)

    return {org_id: len(user_ids) for org_id, user_ids in students_by_org.items()}


def _build_teacher_organization_out(
    db: Session,
    org: Organization,
    requester_teacher_id: UUID,
) -> TeacherOrganizationOut:
    teacher_count = int(
        db.scalar(
            select(func.count(OrganizationMembership.id)).where(
                OrganizationMembership.organization_id == org.id,
                OrganizationMembership.member_role.in_(["owner", "teacher"]),
            )
        )
        or 0
    )
    classroom_count = int(
        db.scalar(
            select(func.count(Classroom.id)).where(Classroom.organization_id == org.id)
        )
        or 0
    )
    student_count = _compute_org_student_counts(db, [org.id]).get(org.id, 0)
    is_member = (
        db.scalar(
            select(OrganizationMembership.id).where(
                OrganizationMembership.organization_id == org.id,
                OrganizationMembership.user_id == requester_teacher_id,
            )
        )
        is not None
    )
    is_owner = org.owner_teacher_id == requester_teacher_id
    visibility: VisibilityType = org.visibility  # type: ignore[assignment]
    return TeacherOrganizationOut(
        id=org.id,
        name=org.name,
        description=org.description,
        visibility=visibility,
        is_owner=is_owner,
        is_member=is_member,
        access_code=org.access_code if is_owner else None,
        owner_id=org.owner_teacher_id,
        owner_name=org.owner_teacher.name,
        teacher_count=teacher_count,
        classroom_count=classroom_count,
        student_count=student_count,
        created_at=org.created_at,
    )


def list_teacher_organizations(db: Session, teacher_id: UUID) -> list[TeacherOrganizationOut]:
    """List organizations with membership flags; exposes access_code only to the owner."""
    orgs = db.scalars(
        select(Organization)
        .options(joinedload(Organization.owner_teacher))
        .order_by(Organization.created_at.desc(), Organization.name.asc())
    ).all()
    if not orgs:
        return []

    org_ids = [org.id for org in orgs]

    teacher_counts = dict(
        db.execute(
            select(
                OrganizationMembership.organization_id,
                func.count(OrganizationMembership.id),
            )
            .where(
                OrganizationMembership.organization_id.in_(org_ids),
                OrganizationMembership.member_role.in_(["owner", "teacher"]),
            )
            .group_by(OrganizationMembership.organization_id)
        ).all()
    )
    classroom_counts = dict(
        db.execute(
            select(Classroom.organization_id, func.count(Classroom.id))
            .where(Classroom.organization_id.in_(org_ids))
            .group_by(Classroom.organization_id)
        ).all()
    )
    student_counts = _compute_org_student_counts(db, org_ids)
    member_org_ids = set(
        db.scalars(
            select(OrganizationMembership.organization_id).where(
                OrganizationMembership.organization_id.in_(org_ids),
                OrganizationMembership.user_id == teacher_id,
            )
        ).all()
    )

    items: list[TeacherOrganizationOut] = []
    for org in orgs:
        is_owner = org.owner_teacher_id == teacher_id
        is_member = org.id in member_org_ids
        visibility: VisibilityType = org.visibility  # type: ignore[assignment]
        items.append(
            TeacherOrganizationOut(
                id=org.id,
                name=org.name,
                description=org.description,
                visibility=visibility,
                is_owner=is_owner,
                is_member=is_member,
                access_code=org.access_code if is_owner else None,
                owner_id=org.owner_teacher_id,
                owner_name=org.owner_teacher.name,
                teacher_count=int(teacher_counts.get(org.id, 0)),
                classroom_count=int(classroom_counts.get(org.id, 0)),
                student_count=int(student_counts.get(org.id, 0)),
                created_at=org.created_at,
            )
        )

    items.sort(key=lambda item: (not item.is_member, item.name.lower()))
    return items


def create_organization(
    db: Session,
    teacher_id: UUID,
    payload: OrganizationCreate,
) -> TeacherOrganizationOut:
    """Create a new organization and register the creator as its owner member."""
    visibility, access_code = validate_visibility_and_code(payload.visibility, payload.access_code)
    org = Organization(
        owner_teacher_id=teacher_id,
        name=payload.name,
        description=payload.description,
        visibility=visibility,
        access_code=access_code,
    )
    db.add(org)
    db.flush()

    owner_membership = OrganizationMembership(
        organization_id=org.id,
        user_id=teacher_id,
        member_role="owner",
    )
    db.add(owner_membership)
    db.commit()

    org = get_organization_or_404(db, org.id)
    return _build_teacher_organization_out(db, org, teacher_id)


def update_organization(
    db: Session,
    org_id: UUID,
    teacher_id: UUID,
    payload: OrganizationUpdate,
) -> TeacherOrganizationOut:
    """Update an organization owned by the authenticated teacher."""
    org = get_owned_organization(db, org_id, teacher_id)
    data = payload.model_dump(exclude_unset=True)

    if "name" in data and data["name"] is not None:
        org.name = data["name"]
    if "description" in data:
        org.description = data["description"]

    new_visibility, new_access_code = apply_visibility_update(
        org.visibility, org.access_code, data
    )
    org.visibility = new_visibility
    org.access_code = new_access_code
    org.updated_at = datetime.now(UTC)

    db.commit()
    org = get_organization_or_404(db, org.id)
    return _build_teacher_organization_out(db, org, teacher_id)


def delete_organization(db: Session, org_id: UUID, teacher_id: UUID) -> None:
    """Delete a teacher-owned organization, detaching its classrooms safely."""
    org = get_owned_organization(db, org_id, teacher_id)
    db.execute(
        update(Classroom)
        .where(Classroom.organization_id == org.id)
        .values(organization_id=None)
    )
    db.delete(org)
    db.commit()


def _join_organization(
    db: Session,
    org_id: UUID,
    user_id: UUID,
    member_role: Literal["teacher", "student"],
    access_code: str | None = None,
) -> OrganizationMembershipOut:
    org = get_organization_or_404(db, org_id)

    existing = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org_id,
            OrganizationMembership.user_id == user_id,
        )
    )
    if existing is not None:
        raise APIError(
            status_code=409,
            detail="Você já é membro desta organização.",
            code="ALREADY_ORGANIZATION_MEMBER",
        )

    if org.visibility == "private" and not verify_access_code(access_code, org.access_code):
        raise APIError(
            status_code=403,
            detail="Código de acesso inválido para esta organização privada.",
            code="INVALID_ACCESS_CODE",
        )

    membership = OrganizationMembership(
        organization_id=org_id,
        user_id=user_id,
        member_role=member_role,
    )
    db.add(membership)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIError(
            status_code=409,
            detail="Você já é membro desta organização.",
            code="ALREADY_ORGANIZATION_MEMBER",
        )
    db.refresh(membership)
    role_out: OrganizationMemberRole = membership.member_role  # type: ignore[assignment]
    return OrganizationMembershipOut(
        organization_id=membership.organization_id,
        user_id=membership.user_id,
        member_role=role_out,
        joined_at=membership.joined_at,
    )


def join_organization_as_teacher(
    db: Session,
    org_id: UUID,
    teacher_id: UUID,
    access_code: str | None = None,
) -> OrganizationMembershipOut:
    """Allow an additional teacher to join an organization (validating code if private)."""
    return _join_organization(
        db, org_id=org_id, user_id=teacher_id, member_role="teacher", access_code=access_code
    )


def join_organization_as_student(
    db: Session,
    org_id: UUID,
    student_id: UUID,
    access_code: str | None = None,
) -> OrganizationMembershipOut:
    """Allow a student to permanently join an organization (validating code if private)."""
    return _join_organization(
        db, org_id=org_id, user_id=student_id, member_role="student", access_code=access_code
    )


def list_student_organizations(db: Session, student_id: UUID) -> list[StudentOrganizationOut]:
    """List organizations visible for student discovery without leaking access codes."""
    orgs = db.scalars(
        select(Organization)
        .options(joinedload(Organization.owner_teacher))
        .order_by(Organization.name.asc())
    ).all()
    if not orgs:
        return []

    org_ids = [org.id for org in orgs]

    memberships = db.scalars(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id.in_(org_ids),
            OrganizationMembership.user_id == student_id,
        )
    ).all()
    joined_by_org = {m.organization_id: m.joined_at for m in memberships}

    classroom_rows = db.execute(
        select(
            Classroom.organization_id,
            func.count(Classroom.id).label("total_count"),
            func.coalesce(
                func.sum(case((Classroom.visibility == "public", 1), else_=0)),
                0,
            ).label("public_count"),
        )
        .where(Classroom.organization_id.in_(org_ids))
        .group_by(Classroom.organization_id)
    ).all()
    counts_by_org = {
        org_id: (int(public_count or 0), int(total_count or 0))
        for org_id, total_count, public_count in classroom_rows
        if org_id is not None
    }

    results: list[StudentOrganizationOut] = []
    for org in orgs:
        public_count, total_count = counts_by_org.get(org.id, (0, 0))
        joined_at = joined_by_org.get(org.id)
        visibility: VisibilityType = org.visibility  # type: ignore[assignment]
        results.append(
            StudentOrganizationOut(
                id=org.id,
                name=org.name,
                description=org.description,
                owner_name=org.owner_teacher.name,
                visibility=visibility,
                is_member=joined_at is not None,
                public_classroom_count=public_count,
                total_classroom_count=total_count,
                joined_at=joined_at,
            )
        )
    return results
