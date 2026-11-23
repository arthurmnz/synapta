import re
import unicodedata
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import APIError
from app.models.classroom import Classroom, ClassroomEnrollment
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
from app.schemas.topic import TopicCreate, TopicOut


def slugify_topic(name: str) -> str:
    """Convert a topic name (including Portuguese accents) into a URL-safe slug."""
    normalized = unicodedata.normalize("NFKD", name)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return slug or "assunto"


def list_topics(db: Session) -> list[TopicOut]:
    """Return all mathematics topics ordered alphabetically."""
    topics = db.scalars(select(Topic).order_by(Topic.name.asc())).all()
    return [TopicOut.model_validate(topic) for topic in topics]


def create_topic(db: Session, payload: TopicCreate) -> TopicOut:
    """Create a new mathematics topic if name and slug are unique."""
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
    classroom = db.get(Classroom, classroom_id)
    if classroom is None:
        raise APIError(status_code=404, detail="Turma não encontrada.", code="CLASSROOM_NOT_FOUND")
    if classroom.teacher_id != teacher_id:
        raise APIError(
            status_code=403,
            detail="Você não tem permissão para gerenciar esta turma.",
            code="FORBIDDEN_CLASSROOM",
        )
    return classroom


def _build_teacher_classroom_out(db: Session, classroom: Classroom) -> TeacherClassroomOut:
    student_count = db.scalar(
        select(func.count(ClassroomEnrollment.id)).where(
            ClassroomEnrollment.classroom_id == classroom.id
        )
    ) or 0
    list_count = db.scalar(
        select(func.count(QuestionList.id)).where(QuestionList.classroom_id == classroom.id)
    ) or 0
    return TeacherClassroomOut(
        id=classroom.id,
        name=classroom.name,
        description=classroom.description,
        student_count=int(student_count),
        list_count=int(list_count),
        created_at=classroom.created_at,
    )


def list_teacher_classrooms(db: Session, teacher_id: UUID) -> list[TeacherClassroomOut]:
    """List classrooms owned by a teacher with student and question list counts."""
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

    rows = db.execute(
        select(
            Classroom,
            func.coalesce(student_counts.c.student_count, 0).label("student_count"),
            func.coalesce(list_counts.c.list_count, 0).label("list_count"),
        )
        .outerjoin(student_counts, student_counts.c.classroom_id == Classroom.id)
        .outerjoin(list_counts, list_counts.c.classroom_id == Classroom.id)
        .where(Classroom.teacher_id == teacher_id)
        .order_by(Classroom.created_at.desc(), Classroom.name.asc())
    ).all()

    return [
        TeacherClassroomOut(
            id=classroom.id,
            name=classroom.name,
            description=classroom.description,
            student_count=int(student_count),
            list_count=int(list_count),
            created_at=classroom.created_at,
        )
        for classroom, student_count, list_count in rows
    ]


def create_classroom(db: Session, teacher_id: UUID, payload: ClassroomCreate) -> TeacherClassroomOut:
    """Create a new classroom owned by the authenticated teacher."""
    classroom = Classroom(
        teacher_id=teacher_id,
        name=payload.name,
        description=payload.description,
    )
    db.add(classroom)
    db.commit()
    db.refresh(classroom)
    return _build_teacher_classroom_out(db, classroom)


def update_classroom(
    db: Session,
    classroom_id: UUID,
    teacher_id: UUID,
    payload: ClassroomUpdate,
) -> TeacherClassroomOut:
    """Update a teacher-owned classroom."""
    classroom = get_owned_classroom(db, classroom_id, teacher_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        classroom.name = data["name"]
    if "description" in data:
        classroom.description = data["description"]
    db.commit()
    db.refresh(classroom)
    return _build_teacher_classroom_out(db, classroom)


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
        .where(QuestionList.is_published.is_(True))
        .group_by(QuestionList.classroom_id)
        .subquery()
    )

    rows = db.execute(
        select(
            Classroom,
            User.name.label("teacher_name"),
            ClassroomEnrollment.enrolled_at,
            func.coalesce(published_counts.c.published_lists_count, 0).label("published_lists_count"),
        )
        .join(ClassroomEnrollment, ClassroomEnrollment.classroom_id == Classroom.id)
        .join(User, User.id == Classroom.teacher_id)
        .outerjoin(published_counts, published_counts.c.classroom_id == Classroom.id)
        .where(ClassroomEnrollment.student_id == student_id)
        .order_by(ClassroomEnrollment.enrolled_at.desc(), Classroom.name.asc())
    ).all()

    return [
        StudentClassroomOut(
            id=classroom.id,
            name=classroom.name,
            description=classroom.description,
            teacher_name=teacher_name,
            published_lists_count=int(published_lists_count),
            enrolled_at=enrolled_at,
        )
        for classroom, teacher_name, enrolled_at, published_lists_count in rows
    ]


def list_available_classrooms(db: Session, student_id: UUID) -> list[AvailableClassroomOut]:
    """Return all classrooms with student counts, published list counts, and enrollment state."""
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
        .where(QuestionList.is_published.is_(True))
        .group_by(QuestionList.classroom_id)
        .subquery()
    )
    enrolled_ids = set(
        db.scalars(
            select(ClassroomEnrollment.classroom_id).where(ClassroomEnrollment.student_id == student_id)
        ).all()
    )

    rows = db.execute(
        select(
            Classroom,
            User.name.label("teacher_name"),
            func.coalesce(student_counts.c.student_count, 0).label("student_count"),
            func.coalesce(published_counts.c.published_lists_count, 0).label("published_lists_count"),
        )
        .join(User, User.id == Classroom.teacher_id)
        .outerjoin(student_counts, student_counts.c.classroom_id == Classroom.id)
        .outerjoin(published_counts, published_counts.c.classroom_id == Classroom.id)
        .order_by(Classroom.name.asc())
    ).all()

    return [
        AvailableClassroomOut(
            id=classroom.id,
            name=classroom.name,
            description=classroom.description,
            teacher_name=teacher_name,
            student_count=int(student_count),
            published_lists_count=int(published_lists_count),
            is_enrolled=classroom.id in enrolled_ids,
        )
        for classroom, teacher_name, student_count, published_lists_count in rows
    ]


def enroll_student(db: Session, classroom_id: UUID, student_id: UUID) -> EnrollmentOut:
    """Enroll the authenticated student in a classroom."""
    classroom = db.get(Classroom, classroom_id)
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
