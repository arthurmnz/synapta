import re
import unicodedata
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.access_codes import apply_visibility_update, validate_visibility_and_code, verify_access_code
from app.core.exceptions import APIError
from app.models.classroom import Classroom, ClassroomEnrollment
from app.models.organization import Organization, OrganizationMembership
from app.models.question_list import QuestionList
from app.models.topic import Topic
from app.models.user import User
from app.schemas.classroom import (
    AvailableClassroomOut,
    ClassroomCreate,
    ClassroomUpdate,
    EnrollmentOut,
    StudentClassroomOut,
    TeacherClassroomOut,
)
from app.schemas.organization import VisibilityType
from app.schemas.topic import TopicCreate, TopicOut
from app.services.organization_service import (
    get_organization_or_404,
    require_organization_membership,
)


def slugify_topic(name: str) -> str:
    """Convert a topic name (including Portuguese accents) into a URL-safe slug."""
    normalized = unicodedata.normalize("NFKD", name)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return slug or "assunto"


def list_topics(db: Session) -> list[TopicOut]:
    """Return all available subjects/topics ordered alphabetically."""
    topics = db.scalars(select(Topic).order_by(Topic.name.asc())).all()
    return [TopicOut.model_validate(topic) for topic in topics]


def create_topic(db: Session, payload: TopicCreate) -> TopicOut:
    """Create a new subject/topic if name and slug are unique."""
    slug = slugify_topic(payload.name)
    duplicate = db.scalar(
        select(Topic).where((func.lower(Topic.name) == payload.name.lower()) | (Topic.slug == slug))
    )
    if duplicate is not None:
        raise APIError(
            status_code=409,
            detail="Já existe um assunto com este nome ou identificador.",
            code="TOPIC_ALREADY_EXISTS",
        )

    topic = Topic(name=payload.name, slug=slug, description=payload.description)
    db.add(topic)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIError(
            status_code=409,
            detail="Já existe um assunto com este nome ou identificador.",
            code="TOPIC_ALREADY_EXISTS",
        )
    db.refresh(topic)
    return TopicOut.model_validate(topic)


def get_owned_classroom(db: Session, classroom_id: UUID, teacher_id: UUID) -> Classroom:
    """Fetch a classroom and enforce teacher ownership."""
    classroom = db.scalar(
        select(Classroom)
        .options(joinedload(Classroom.organization), joinedload(Classroom.teacher))
        .where(Classroom.id == classroom_id)
    )
    if classroom is None:
        raise APIError(status_code=404, detail="Turma não encontrada.", code="CLASSROOM_NOT_FOUND")
    if classroom.teacher_id != teacher_id:
        raise APIError(
            status_code=403,
            detail="Você não tem permissão para gerenciar esta turma.",
            code="FORBIDDEN_CLASSROOM",
        )
    return classroom


def _build_teacher_classroom_out(
    db: Session,
    classroom: Classroom,
    requester_teacher_id: UUID,
) -> TeacherClassroomOut:
    student_count = db.scalar(
        select(func.count(ClassroomEnrollment.id)).where(
            ClassroomEnrollment.classroom_id == classroom.id
        )
    ) or 0
    list_count = db.scalar(
        select(func.count(QuestionList.id)).where(QuestionList.classroom_id == classroom.id)
    ) or 0
    is_owner = classroom.teacher_id == requester_teacher_id
    visibility: VisibilityType = classroom.visibility  # type: ignore[assignment]
    return TeacherClassroomOut(
        id=classroom.id,
        name=classroom.name,
        description=classroom.description,
        organization_id=classroom.organization_id,
        organization_name=classroom.organization.name if classroom.organization else None,
        visibility=visibility,
        access_code=classroom.access_code if is_owner else None,
        teacher_id=classroom.teacher_id,
        teacher_name=classroom.teacher.name,
        student_count=int(student_count),
        list_count=int(list_count),
        created_at=classroom.created_at,
    )


def _fetch_teacher_classrooms(
    db: Session,
    *,
    requester_teacher_id: UUID,
    owner_teacher_id: UUID | None = None,
    organization_id: UUID | None = None,
) -> list[TeacherClassroomOut]:
    student_counts = (
        select(
            ClassroomEnrollment.classroom_id.label("classroom_id"),
            func.count(ClassroomEnrollment.id).label("student_count"),
        )
        .group_by(ClassroomEnrollment.classroom_id)
        .subquery()
    )
    list_counts = (
        select(
            QuestionList.classroom_id.label("classroom_id"),
            func.count(QuestionList.id).label("list_count"),
        )
        .group_by(QuestionList.classroom_id)
        .subquery()
    )

    stmt = (
        select(
            Classroom,
            User.name.label("teacher_name"),
            Organization.name.label("organization_name"),
            func.coalesce(student_counts.c.student_count, 0).label("student_count"),
            func.coalesce(list_counts.c.list_count, 0).label("list_count"),
        )
        .join(User, User.id == Classroom.teacher_id)
        .outerjoin(Organization, Organization.id == Classroom.organization_id)
        .outerjoin(student_counts, student_counts.c.classroom_id == Classroom.id)
        .outerjoin(list_counts, list_counts.c.classroom_id == Classroom.id)
        .order_by(Classroom.created_at.desc(), Classroom.name.asc())
    )
    if owner_teacher_id is not None:
        stmt = stmt.where(Classroom.teacher_id == owner_teacher_id)
    if organization_id is not None:
        stmt = stmt.where(Classroom.organization_id == organization_id)

    rows = db.execute(stmt).all()
    results: list[TeacherClassroomOut] = []
    for classroom, teacher_name, organization_name, student_count, list_count in rows:
        is_owner = classroom.teacher_id == requester_teacher_id
        visibility: VisibilityType = classroom.visibility  # type: ignore[assignment]
        results.append(
            TeacherClassroomOut(
                id=classroom.id,
                name=classroom.name,
                description=classroom.description,
                organization_id=classroom.organization_id,
                organization_name=organization_name,
                visibility=visibility,
                access_code=classroom.access_code if is_owner else None,
                teacher_id=classroom.teacher_id,
                teacher_name=teacher_name,
                student_count=int(student_count),
                list_count=int(list_count),
                created_at=classroom.created_at,
            )
        )
    return results


def list_teacher_classrooms(
    db: Session,
    teacher_id: UUID,
    organization_id: UUID | None = None,
) -> list[TeacherClassroomOut]:
    """List classrooms owned by a teacher, optionally filtered by organization."""
    if organization_id is not None:
        require_organization_membership(
            db,
            organization_id,
            teacher_id,
            allowed_roles=("owner", "teacher"),
            error_code="FORBIDDEN_ORGANIZATION",
            error_detail="Você não tem acesso a esta organização.",
        )
    return _fetch_teacher_classrooms(
        db,
        requester_teacher_id=teacher_id,
        owner_teacher_id=teacher_id,
        organization_id=organization_id,
    )


def list_organization_classrooms_for_teacher(
    db: Session,
    org_id: UUID,
    teacher_id: UUID,
) -> list[TeacherClassroomOut]:
    """List all classrooms inside an organization for an authenticated teacher member."""
    require_organization_membership(
        db,
        org_id,
        teacher_id,
        allowed_roles=("owner", "teacher"),
        error_code="FORBIDDEN_ORGANIZATION",
        error_detail="Você precisa ser membro desta organização para visualizar suas turmas.",
    )
    return _fetch_teacher_classrooms(
        db,
        requester_teacher_id=teacher_id,
        organization_id=org_id,
    )


def create_classroom(
    db: Session,
    teacher_id: UUID,
    payload: ClassroomCreate,
) -> TeacherClassroomOut:
    """Create a new classroom owned by the authenticated teacher."""
    if payload.organization_id is not None:
        require_organization_membership(
            db,
            payload.organization_id,
            teacher_id,
            allowed_roles=("owner", "teacher"),
            error_code="FORBIDDEN_ORGANIZATION",
            error_detail="Você precisa ser membro desta organização para criar uma turma nela.",
        )

    visibility, access_code = validate_visibility_and_code(payload.visibility, payload.access_code)
    classroom = Classroom(
        teacher_id=teacher_id,
        organization_id=payload.organization_id,
        name=payload.name,
        description=payload.description,
        visibility=visibility,
        access_code=access_code,
    )
    db.add(classroom)
    db.commit()
    classroom = get_owned_classroom(db, classroom.id, teacher_id)
    return _build_teacher_classroom_out(db, classroom, teacher_id)


def update_classroom(
    db: Session,
    classroom_id: UUID,
    teacher_id: UUID,
    payload: ClassroomUpdate,
) -> TeacherClassroomOut:
    """Update a teacher-owned classroom."""
    classroom = get_owned_classroom(db, classroom_id, teacher_id)
    data = payload.model_dump(exclude_unset=True)

    if "organization_id" in data:
        new_org_id = data["organization_id"]
        if new_org_id is not None:
            require_organization_membership(
                db,
                new_org_id,
                teacher_id,
                allowed_roles=("owner", "teacher"),
                error_code="FORBIDDEN_ORGANIZATION",
                error_detail="Você precisa ser membro desta organização para vincular a turma.",
            )
        classroom.organization_id = new_org_id

    if "name" in data and data["name"] is not None:
        classroom.name = data["name"]
    if "description" in data:
        classroom.description = data["description"]

    new_visibility, new_access_code = apply_visibility_update(
        classroom.visibility, classroom.access_code, data
    )
    classroom.visibility = new_visibility
    classroom.access_code = new_access_code

    db.commit()
    classroom = get_owned_classroom(db, classroom_id, teacher_id)
    return _build_teacher_classroom_out(db, classroom, teacher_id)


def delete_classroom(db: Session, classroom_id: UUID, teacher_id: UUID) -> None:
    """Delete a teacher-owned classroom and its dependent data."""
    classroom = get_owned_classroom(db, classroom_id, teacher_id)
    db.delete(classroom)
    db.commit()


def list_student_enrolled_classrooms(db: Session, student_id: UUID) -> list[StudentClassroomOut]:
    """Return classrooms where the student is currently enrolled."""
    published_counts = (
        select(
            QuestionList.classroom_id.label("classroom_id"),
            func.count(QuestionList.id).label("published_lists_count"),
        )
        .where(QuestionList.is_published.is_(True), QuestionList.is_standalone.is_(False))
        .group_by(QuestionList.classroom_id)
        .subquery()
    )

    rows = db.execute(
        select(
            Classroom,
            User.name.label("teacher_name"),
            Organization.name.label("organization_name"),
            Organization.visibility.label("organization_visibility"),
            ClassroomEnrollment.enrolled_at,
            func.coalesce(published_counts.c.published_lists_count, 0).label("published_lists_count"),
        )
        .join(ClassroomEnrollment, ClassroomEnrollment.classroom_id == Classroom.id)
        .join(User, User.id == Classroom.teacher_id)
        .outerjoin(Organization, Organization.id == Classroom.organization_id)
        .outerjoin(published_counts, published_counts.c.classroom_id == Classroom.id)
        .where(ClassroomEnrollment.student_id == student_id)
        .order_by(ClassroomEnrollment.enrolled_at.desc(), Classroom.name.asc())
    ).all()

    results: list[StudentClassroomOut] = []
    for (
        classroom,
        teacher_name,
        organization_name,
        organization_visibility,
        enrolled_at,
        published_lists_count,
    ) in rows:
        vis: VisibilityType = classroom.visibility  # type: ignore[assignment]
        org_vis: VisibilityType | None = organization_visibility  # type: ignore[assignment]
        results.append(
            StudentClassroomOut(
                id=classroom.id,
                name=classroom.name,
                description=classroom.description,
                organization_id=classroom.organization_id,
                organization_name=organization_name,
                organization_visibility=org_vis,
                visibility=vis,
                teacher_name=teacher_name,
                published_lists_count=int(published_lists_count),
                enrolled_at=enrolled_at,
            )
        )
    return results


def list_available_classrooms(
    db: Session,
    student_id: UUID,
    organization_id: UUID | None = None,
) -> list[AvailableClassroomOut]:
    """Return discoverable classrooms respecting private organization boundaries."""
    if organization_id is not None:
        org = get_organization_or_404(db, organization_id)
        if org.visibility == "private":
            require_organization_membership(
                db,
                organization_id,
                student_id,
                error_code="ORGANIZATION_ACCESS_REQUIRED",
                error_detail="Esta organização é privada. Insira o código de acesso para visualizar suas turmas.",
            )

    student_counts = (
        select(
            ClassroomEnrollment.classroom_id.label("classroom_id"),
            func.count(ClassroomEnrollment.id).label("student_count"),
        )
        .group_by(ClassroomEnrollment.classroom_id)
        .subquery()
    )
    published_counts = (
        select(
            QuestionList.classroom_id.label("classroom_id"),
            func.count(QuestionList.id).label("published_lists_count"),
        )
        .where(QuestionList.is_published.is_(True), QuestionList.is_standalone.is_(False))
        .group_by(QuestionList.classroom_id)
        .subquery()
    )
    enrolled_ids = set(
        db.scalars(
            select(ClassroomEnrollment.classroom_id).where(ClassroomEnrollment.student_id == student_id)
        ).all()
    )
    member_org_ids = set(
        db.scalars(
            select(OrganizationMembership.organization_id).where(
                OrganizationMembership.user_id == student_id
            )
        ).all()
    )

    stmt = (
        select(
            Classroom,
            User.name.label("teacher_name"),
            Organization.name.label("organization_name"),
            Organization.visibility.label("organization_visibility"),
            func.coalesce(student_counts.c.student_count, 0).label("student_count"),
            func.coalesce(published_counts.c.published_lists_count, 0).label("published_lists_count"),
        )
        .join(User, User.id == Classroom.teacher_id)
        .outerjoin(Organization, Organization.id == Classroom.organization_id)
        .outerjoin(student_counts, student_counts.c.classroom_id == Classroom.id)
        .outerjoin(published_counts, published_counts.c.classroom_id == Classroom.id)
        .order_by(Classroom.name.asc())
    )

    if organization_id is not None:
        stmt = stmt.where(Classroom.organization_id == organization_id)
    else:
        visibility_filters = [
            Classroom.organization_id.is_(None),
            Organization.visibility == "public",
        ]
        if member_org_ids:
            visibility_filters.append(Classroom.organization_id.in_(member_org_ids))
        stmt = stmt.where(or_(*visibility_filters))

    rows = db.execute(stmt).all()

    results: list[AvailableClassroomOut] = []
    for (
        classroom,
        teacher_name,
        organization_name,
        organization_visibility,
        student_count,
        published_lists_count,
    ) in rows:
        vis: VisibilityType = classroom.visibility  # type: ignore[assignment]
        org_vis: VisibilityType | None = organization_visibility  # type: ignore[assignment]
        results.append(
            AvailableClassroomOut(
                id=classroom.id,
                name=classroom.name,
                description=classroom.description,
                organization_id=classroom.organization_id,
                organization_name=organization_name,
                organization_visibility=org_vis,
                visibility=vis,
                teacher_name=teacher_name,
                student_count=int(student_count),
                published_lists_count=int(published_lists_count),
                is_enrolled=classroom.id in enrolled_ids,
            )
        )
    return results


def enroll_student(
    db: Session,
    classroom_id: UUID,
    student_id: UUID,
    access_code: str | None = None,
) -> EnrollmentOut:
    """Enroll a student in a classroom after enforcing organization and classroom visibility rules."""
    classroom = db.scalar(
        select(Classroom)
        .options(joinedload(Classroom.organization))
        .where(Classroom.id == classroom_id)
    )
    if classroom is None:
        raise APIError(status_code=404, detail="Turma não encontrada.", code="CLASSROOM_NOT_FOUND")

    existing = db.scalar(
        select(ClassroomEnrollment).where(
            ClassroomEnrollment.classroom_id == classroom_id,
            ClassroomEnrollment.student_id == student_id,
        )
    )
    if existing is not None:
        raise APIError(
            status_code=409,
            detail="Você já está matriculado nesta turma.",
            code="ALREADY_ENROLLED",
        )

    if classroom.organization is not None and classroom.organization.visibility == "private":
        require_organization_membership(
            db,
            classroom.organization.id,
            student_id,
            error_code="ORGANIZATION_ACCESS_REQUIRED",
            error_detail="Esta turma pertence a uma organização privada. Entre na organização primeiro.",
        )

    if classroom.visibility == "private" and not verify_access_code(access_code, classroom.access_code):
        raise APIError(
            status_code=403,
            detail="Código de acesso inválido para esta turma privada.",
            code="INVALID_ACCESS_CODE",
        )

    enrollment = ClassroomEnrollment(classroom_id=classroom_id, student_id=student_id)
    db.add(enrollment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIError(
            status_code=409,
            detail="Você já está matriculado nesta turma.",
            code="ALREADY_ENROLLED",
        )
    db.refresh(enrollment)
    return EnrollmentOut(
        classroom_id=enrollment.classroom_id,
        student_id=enrollment.student_id,
        enrolled_at=enrollment.enrolled_at,
    )
