from collections import defaultdict
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.access_codes import apply_visibility_update, validate_visibility_and_code, verify_access_code
from app.core.exceptions import APIError
from app.models.classroom import Classroom, ClassroomEnrollment
from app.models.organization import Organization, OrganizationMembership
from app.models.question_list import Question, QuestionList, QuestionListUnlock
from app.models.submission import RetakeAuthorization, Submission
from app.models.topic import Topic
from app.schemas.question_list import (
    OptionLetter,
    QuestionCreate,
    QuestionListCreate,
    QuestionListUpdate,
    QuestionOptions,
    QuestionUpdate,
    StudentListDetailOut,
    StudentListSummaryOut,
    StudentPastSubmissionItemOut,
    StudentQuestionOut,
    TeacherListDetailOut,
    TeacherListSummaryOut,
    TeacherQuestionOut,
)
from app.schemas.organization import VisibilityType
from app.services.classroom_service import get_owned_classroom
from app.services.organization_service import (
    get_organization_or_404,
    require_organization_membership,
)
from app.services.submission_service import (
    enforce_student_list_access,
    extract_list_hierarchy_meta,
    resolve_retake_state,
)


def _get_owned_list(db: Session, list_id: UUID, teacher_id: UUID) -> QuestionList:
    qlist = db.scalar(
        select(QuestionList)
        .options(
            joinedload(QuestionList.classroom).joinedload(Classroom.organization),
            joinedload(QuestionList.questions).joinedload(Question.topic),
        )
        .where(QuestionList.id == list_id)
    )
    if qlist is None:
        raise APIError(status_code=404, detail="Lista de questões não encontrada.", code="LIST_NOT_FOUND")
    if qlist.teacher_id != teacher_id:
        raise APIError(
            status_code=403,
            detail="Você não tem permissão para gerenciar esta lista.",
            code="FORBIDDEN_LIST",
        )
    return qlist


def _get_owned_list_for_update(db: Session, list_id: UUID, teacher_id: UUID) -> QuestionList:
    qlist = db.scalar(
        select(QuestionList)
        .where(QuestionList.id == list_id)
        .with_for_update()
    )
    if qlist is None:
        raise APIError(status_code=404, detail="Lista de questões não encontrada.", code="LIST_NOT_FOUND")
    if qlist.teacher_id != teacher_id:
        raise APIError(
            status_code=403,
            detail="Você não tem permissão para gerenciar esta lista.",
            code="FORBIDDEN_LIST",
        )
    return qlist


def _count_list_submissions(db: Session, list_id: UUID) -> int:
    return int(
        db.scalar(select(func.count(Submission.id)).where(Submission.question_list_id == list_id)) or 0
    )


def _build_teacher_question_out(question: Question) -> TeacherQuestionOut:
    correct_opt: OptionLetter = question.correct_option  # type: ignore[assignment]
    return TeacherQuestionOut(
        id=question.id,
        question_list_id=question.question_list_id,
        topic_id=question.topic_id,
        topic_name=question.topic.name,
        order_index=question.order_index,
        statement=question.statement,
        options=QuestionOptions(
            A=question.option_a,
            B=question.option_b,
            C=question.option_c,
            D=question.option_d,
        ),
        correct_option=correct_opt,
        explanation=question.explanation,
    )


def _build_teacher_list_detail(db: Session, qlist: QuestionList) -> TeacherListDetailOut:
    submission_count = _count_list_submissions(db, qlist.id)
    ordered_questions = sorted(qlist.questions, key=lambda q: (q.order_index, q.created_at))
    hierarchy = extract_list_hierarchy_meta(qlist)
    visibility: VisibilityType = qlist.visibility  # type: ignore[assignment]
    return TeacherListDetailOut(
        id=qlist.id,
        classroom_id=hierarchy["classroom_id"],
        classroom_name=hierarchy["classroom_name"],
        organization_id=hierarchy["organization_id"],
        organization_name=hierarchy["organization_name"],
        is_standalone=hierarchy["is_standalone"],
        visibility=visibility,
        access_code=qlist.access_code,
        title=qlist.title,
        description=qlist.description,
        is_published=qlist.is_published,
        question_count=len(ordered_questions),
        submission_count=submission_count,
        has_submissions=submission_count > 0,
        created_at=qlist.created_at,
        updated_at=qlist.updated_at,
        questions=[_build_teacher_question_out(q) for q in ordered_questions],
    )


def list_teacher_lists(
    db: Session,
    teacher_id: UUID,
    organization_id: UUID | None = None,
    classroom_id: UUID | None = None,
    list_type: Literal["all", "classroom", "standalone"] = "all",
) -> list[TeacherListSummaryOut]:
    """List question lists owned by the teacher, with optional hierarchy and type filters."""
    if organization_id is not None:
        require_organization_membership(
            db,
            organization_id,
            teacher_id,
            allowed_roles=("owner", "teacher"),
            error_code="FORBIDDEN_ORGANIZATION",
            error_detail="Você não tem permissão para acessar esta organização.",
        )
    if classroom_id is not None:
        get_owned_classroom(db, classroom_id, teacher_id)

    question_counts = (
        select(
            Question.question_list_id.label("list_id"),
            func.count(Question.id).label("question_count"),
        )
        .group_by(Question.question_list_id)
        .subquery()
    )
    submission_counts = (
        select(
            Submission.question_list_id.label("list_id"),
            func.count(Submission.id).label("submission_count"),
        )
        .group_by(Submission.question_list_id)
        .subquery()
    )

    stmt = (
        select(
            QuestionList,
            Classroom.name.label("classroom_name"),
            Organization.id.label("organization_id"),
            Organization.name.label("organization_name"),
            func.coalesce(question_counts.c.question_count, 0).label("question_count"),
            func.coalesce(submission_counts.c.submission_count, 0).label("submission_count"),
        )
        .outerjoin(Classroom, Classroom.id == QuestionList.classroom_id)
        .outerjoin(Organization, Organization.id == Classroom.organization_id)
        .outerjoin(question_counts, question_counts.c.list_id == QuestionList.id)
        .outerjoin(submission_counts, submission_counts.c.list_id == QuestionList.id)
        .where(QuestionList.teacher_id == teacher_id)
        .order_by(QuestionList.created_at.desc(), QuestionList.title.asc())
    )
    if list_type == "classroom":
        stmt = stmt.where(QuestionList.is_standalone.is_(False))
    elif list_type == "standalone":
        stmt = stmt.where(QuestionList.is_standalone.is_(True))

    if organization_id is not None:
        stmt = stmt.where(
            QuestionList.is_standalone.is_(False),
            Classroom.organization_id == organization_id,
        )
    if classroom_id is not None:
        stmt = stmt.where(QuestionList.classroom_id == classroom_id)

    rows = db.execute(stmt).all()
    results: list[TeacherListSummaryOut] = []
    for qlist, classroom_name, org_id, org_name, question_count, submission_count in rows:
        visibility: VisibilityType = qlist.visibility  # type: ignore[assignment]
        results.append(
            TeacherListSummaryOut(
                id=qlist.id,
                classroom_id=qlist.classroom_id,
                classroom_name=classroom_name,
                organization_id=org_id,
                organization_name=org_name,
                is_standalone=qlist.is_standalone,
                visibility=visibility,
                access_code=qlist.access_code,
                title=qlist.title,
                description=qlist.description,
                is_published=qlist.is_published,
                question_count=int(question_count),
                submission_count=int(submission_count),
                created_at=qlist.created_at,
                updated_at=qlist.updated_at,
            )
        )
    return results


def create_teacher_list(
    db: Session,
    teacher_id: UUID,
    payload: QuestionListCreate,
) -> TeacherListDetailOut:
    """Create a draft question list (classroom-attached or standalone)."""
    if payload.is_standalone:
        classroom_id = None
        visibility = "public"
        access_code = None
    else:
        if payload.classroom_id is None:
            raise APIError(
                status_code=422,
                detail="Simulado de turma exige classroom_id.",
                code="INVALID_LIST_CONFIGURATION",
            )
        classroom = get_owned_classroom(db, payload.classroom_id, teacher_id)
        classroom_id = classroom.id
        visibility, access_code = validate_visibility_and_code(
            payload.visibility, payload.access_code
        )

    qlist = QuestionList(
        classroom_id=classroom_id,
        teacher_id=teacher_id,
        is_standalone=payload.is_standalone,
        visibility=visibility,
        access_code=access_code,
        title=payload.title,
        description=payload.description,
        is_published=False,
    )
    db.add(qlist)
    db.commit()
    qlist = _get_owned_list(db, qlist.id, teacher_id)
    return _build_teacher_list_detail(db, qlist)


def get_teacher_list_detail(db: Session, list_id: UUID, teacher_id: UUID) -> TeacherListDetailOut:
    """Retrieve a teacher-owned question list with its questions."""
    qlist = _get_owned_list(db, list_id, teacher_id)
    return _build_teacher_list_detail(db, qlist)


def update_teacher_list(
    db: Session,
    list_id: UUID,
    teacher_id: UUID,
    payload: QuestionListUpdate,
) -> TeacherListDetailOut:
    """Update metadata, classification, visibility, or publication status of a list."""
    qlist = _get_owned_list_for_update(db, list_id, teacher_id)
    data = payload.model_dump(exclude_unset=True)

    new_is_standalone = (
        data["is_standalone"]
        if ("is_standalone" in data and data["is_standalone"] is not None)
        else qlist.is_standalone
    )
    if new_is_standalone:
        if "classroom_id" in data and data["classroom_id"] is not None:
            raise APIError(
                status_code=422,
                detail="Simulado avulso não pode estar vinculado a uma turma.",
                code="INVALID_LIST_CONFIGURATION",
            )
        new_classroom_id: UUID | None = None
    else:
        if "classroom_id" in data:
            if data["classroom_id"] is None:
                raise APIError(
                    status_code=422,
                    detail="Simulado de turma exige uma turma.",
                    code="INVALID_LIST_CONFIGURATION",
                )
            new_classroom_id = data["classroom_id"]
        else:
            new_classroom_id = qlist.classroom_id

        if new_classroom_id is None:
            raise APIError(
                status_code=422,
                detail="Simulado de turma exige uma turma.",
                code="INVALID_LIST_CONFIGURATION",
            )

    classification_changed = (
        new_is_standalone != qlist.is_standalone or new_classroom_id != qlist.classroom_id
    )
    if classification_changed:
        if _count_list_submissions(db, list_id) > 0:
            raise APIError(
                status_code=409,
                detail="Não é possível alterar a classificação ou turma de uma lista que já possui submissões.",
                code="LIST_HAS_SUBMISSIONS",
            )
        if not new_is_standalone and new_classroom_id is not None:
            get_owned_classroom(db, new_classroom_id, teacher_id)

    if new_is_standalone:
        if data.get("visibility") == "private":
            raise APIError(
                status_code=422,
                detail="Simulado avulso deve ser sempre público.",
                code="INVALID_LIST_CONFIGURATION",
            )
        new_visibility = "public"
        new_access_code = None
    else:
        new_visibility, new_access_code = apply_visibility_update(
            qlist.visibility, qlist.access_code, data
        )

    if data.get("is_published") is True:
        question_count = int(
            db.scalar(select(func.count(Question.id)).where(Question.question_list_id == list_id))
            or 0
        )
        if question_count == 0:
            raise APIError(
                status_code=422,
                detail="Não é possível publicar uma lista sem questões cadastradas.",
                code="EMPTY_LIST_CANNOT_PUBLISH",
            )

    qlist.is_standalone = new_is_standalone
    qlist.classroom_id = new_classroom_id
    qlist.visibility = new_visibility
    qlist.access_code = new_access_code

    if "title" in data and data["title"] is not None:
        qlist.title = data["title"]
    if "description" in data:
        qlist.description = data["description"]
    if "is_published" in data and data["is_published"] is not None:
        qlist.is_published = data["is_published"]

    qlist.updated_at = datetime.now(UTC)
    db.commit()
    qlist = _get_owned_list(db, list_id, teacher_id)
    return _build_teacher_list_detail(db, qlist)


def delete_teacher_list(db: Session, list_id: UUID, teacher_id: UUID) -> None:
    """Delete a teacher-owned question list."""
    qlist = _get_owned_list(db, list_id, teacher_id)
    db.delete(qlist)
    db.commit()


def add_question(
    db: Session,
    list_id: UUID,
    teacher_id: UUID,
    payload: QuestionCreate,
) -> TeacherQuestionOut:
    """Add a multiple-choice question to a list that has no submissions yet."""
    qlist = _get_owned_list_for_update(db, list_id, teacher_id)
    if _count_list_submissions(db, list_id) > 0:
        raise APIError(
            status_code=409,
            detail="Não é possível adicionar questões porque esta lista já possui submissões de alunos.",
            code="LIST_HAS_SUBMISSIONS",
        )

    topic = db.get(Topic, payload.topic_id)
    if topic is None:
        raise APIError(status_code=404, detail="Assunto não encontrado.", code="TOPIC_NOT_FOUND")

    order_index = payload.order_index
    if order_index is None:
        max_order = db.scalar(
            select(func.coalesce(func.max(Question.order_index), 0)).where(
                Question.question_list_id == list_id
            )
        )
        order_index = int(max_order or 0) + 1

    question = Question(
        question_list_id=list_id,
        topic_id=topic.id,
        order_index=order_index,
        statement=payload.statement,
        option_a=payload.options.A,
        option_b=payload.options.B,
        option_c=payload.options.C,
        option_d=payload.options.D,
        correct_option=payload.correct_option,
        explanation=payload.explanation,
    )
    qlist.updated_at = datetime.now(UTC)
    db.add(question)
    db.commit()
    db.refresh(question)
    question.topic = topic
    return _build_teacher_question_out(question)


def update_question(
    db: Session,
    question_id: UUID,
    teacher_id: UUID,
    payload: QuestionUpdate,
) -> TeacherQuestionOut:
    """Update a question; blocks answer-key or topic edits once submissions exist."""
    question_ref = db.get(Question, question_id)
    if question_ref is None:
        raise APIError(status_code=404, detail="Questão não encontrada.", code="QUESTION_NOT_FOUND")

    qlist = _get_owned_list_for_update(db, question_ref.question_list_id, teacher_id)
    question = db.scalar(
        select(Question)
        .options(joinedload(Question.topic))
        .where(Question.id == question_id)
        .execution_options(populate_existing=True)
    )
    if question is None:
        raise APIError(status_code=404, detail="Questão não encontrada.", code="QUESTION_NOT_FOUND")

    has_submissions = _count_list_submissions(db, qlist.id) > 0
    data = payload.model_dump(exclude_unset=True)

    if has_submissions:
        changing_topic = "topic_id" in data and data["topic_id"] is not None and data["topic_id"] != question.topic_id
        changing_correct = (
            "correct_option" in data
            and data["correct_option"] is not None
            and data["correct_option"] != question.correct_option
        )
        changing_options = False
        if payload.options is not None:
            changing_options = (
                payload.options.A != question.option_a
                or payload.options.B != question.option_b
                or payload.options.C != question.option_c
                or payload.options.D != question.option_d
            )
        if changing_topic or changing_correct or changing_options:
            raise APIError(
                status_code=409,
                detail="Não é possível alterar alternativas, gabarito ou assunto após o início das submissões.",
                code="LIST_HAS_SUBMISSIONS",
            )

    if "topic_id" in data and data["topic_id"] is not None and data["topic_id"] != question.topic_id:
        topic = db.get(Topic, data["topic_id"])
        if topic is None:
            raise APIError(status_code=404, detail="Assunto não encontrado.", code="TOPIC_NOT_FOUND")
        question.topic_id = topic.id
        question.topic = topic

    if "statement" in data and data["statement"] is not None:
        question.statement = data["statement"]
    if "explanation" in data and data["explanation"] is not None:
        question.explanation = data["explanation"]
    if "order_index" in data and data["order_index"] is not None:
        question.order_index = data["order_index"]
    if payload.options is not None and not has_submissions:
        question.option_a = payload.options.A
        question.option_b = payload.options.B
        question.option_c = payload.options.C
        question.option_d = payload.options.D
    if "correct_option" in data and data["correct_option"] is not None and not has_submissions:
        question.correct_option = data["correct_option"]

    qlist.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(question)
    return _build_teacher_question_out(question)


def delete_question(db: Session, question_id: UUID, teacher_id: UUID) -> None:
    """Delete a question if its parent list has no submissions yet."""
    question = db.get(Question, question_id)
    if question is None:
        raise APIError(status_code=404, detail="Questão não encontrada.", code="QUESTION_NOT_FOUND")

    qlist = _get_owned_list_for_update(db, question.question_list_id, teacher_id)
    question = db.scalar(
        select(Question)
        .where(Question.id == question_id)
        .execution_options(populate_existing=True)
    )
    if question is None:
        raise APIError(status_code=404, detail="Questão não encontrada.", code="QUESTION_NOT_FOUND")

    if _count_list_submissions(db, qlist.id) > 0:
        raise APIError(
            status_code=409,
            detail="Não é possível remover questões de uma lista que já possui submissões.",
            code="LIST_HAS_SUBMISSIONS",
        )

    qlist.updated_at = datetime.now(UTC)
    db.delete(question)
    db.commit()


def list_student_lists(
    db: Session,
    student_id: UUID,
    organization_id: UUID | None = None,
    classroom_id: UUID | None = None,
    scope: Literal["all", "classroom", "standalone"] = "all",
) -> list[StudentListSummaryOut]:
    """List published classroom and/or standalone lists accessible to the student."""
    if organization_id is not None:
        org = get_organization_or_404(db, organization_id)
        if org.visibility == "private":
            require_organization_membership(
                db,
                organization_id,
                student_id,
                error_code="ORGANIZATION_ACCESS_REQUIRED",
                error_detail="Esta organização é privada. Entre na organização para visualizar suas listas.",
            )

    if classroom_id is not None:
        classroom = db.scalar(
            select(Classroom)
            .options(joinedload(Classroom.organization))
            .where(Classroom.id == classroom_id)
        )
        if classroom is None:
            raise APIError(status_code=404, detail="Turma não encontrada.", code="CLASSROOM_NOT_FOUND")
        if classroom.organization is not None and classroom.organization.visibility == "private":
            require_organization_membership(
                db,
                classroom.organization.id,
                student_id,
                error_code="ORGANIZATION_ACCESS_REQUIRED",
                error_detail="Esta turma pertence a uma organização privada. Entre na organização primeiro.",
            )
        enrolled = db.scalar(
            select(ClassroomEnrollment).where(
                ClassroomEnrollment.classroom_id == classroom_id,
                ClassroomEnrollment.student_id == student_id,
            )
        )
        if enrolled is None:
            raise APIError(
                status_code=403,
                detail="Você não está matriculado nesta turma.",
                code="NOT_ENROLLED",
            )

    member_org_ids = set(
        db.scalars(
            select(OrganizationMembership.organization_id).where(
                OrganizationMembership.user_id == student_id
            )
        ).all()
    )

    conditions = []

    if scope in ("all", "classroom"):
        enrolled_stmt = (
            select(Classroom.id)
            .join(ClassroomEnrollment, ClassroomEnrollment.classroom_id == Classroom.id)
            .outerjoin(Organization, Organization.id == Classroom.organization_id)
            .where(ClassroomEnrollment.student_id == student_id)
        )
        org_access_filters = [
            Classroom.organization_id.is_(None),
            Organization.visibility == "public",
        ]
        if member_org_ids:
            org_access_filters.append(Classroom.organization_id.in_(member_org_ids))
        enrolled_stmt = enrolled_stmt.where(or_(*org_access_filters))

        if organization_id is not None:
            enrolled_stmt = enrolled_stmt.where(Classroom.organization_id == organization_id)
        if classroom_id is not None:
            enrolled_stmt = enrolled_stmt.where(Classroom.id == classroom_id)

        eligible_classroom_ids = list(db.scalars(enrolled_stmt).all())
        if eligible_classroom_ids:
            conditions.append(
                and_(
                    QuestionList.is_standalone.is_(False),
                    QuestionList.classroom_id.in_(eligible_classroom_ids),
                )
            )

    if scope in ("all", "standalone") and organization_id is None and classroom_id is None:
        conditions.append(QuestionList.is_standalone.is_(True))

    if not conditions:
        return []

    question_counts = (
        select(
            Question.question_list_id.label("list_id"),
            func.count(Question.id).label("question_count"),
        )
        .group_by(Question.question_list_id)
        .subquery()
    )

    stmt = (
        select(
            QuestionList,
            Classroom.name.label("classroom_name"),
            Organization.id.label("organization_id"),
            Organization.name.label("organization_name"),
            func.coalesce(question_counts.c.question_count, 0).label("question_count"),
        )
        .outerjoin(Classroom, Classroom.id == QuestionList.classroom_id)
        .outerjoin(Organization, Organization.id == Classroom.organization_id)
        .outerjoin(question_counts, question_counts.c.list_id == QuestionList.id)
        .options(joinedload(QuestionList.teacher))
        .where(
            QuestionList.is_published.is_(True),
            or_(*conditions),
        )
        .order_by(QuestionList.created_at.desc(), QuestionList.title.asc())
    )

    rows = db.execute(stmt).all()
    if not rows:
        return []

    list_ids = [qlist.id for qlist, _, _, _, _ in rows]

    unlocked_ids = set(
        db.scalars(
            select(QuestionListUnlock.question_list_id).where(
                QuestionListUnlock.student_id == student_id,
                QuestionListUnlock.question_list_id.in_(list_ids),
            )
        ).all()
    )

    student_subs = db.scalars(
        select(Submission)
        .where(Submission.student_id == student_id, Submission.question_list_id.in_(list_ids))
        .order_by(Submission.attempt_number.desc())
    ).all()
    subs_by_list: dict[UUID, list[Submission]] = defaultdict(list)
    for sub in student_subs:
        subs_by_list[sub.question_list_id].append(sub)

    retake_rows = db.scalars(
        select(RetakeAuthorization).where(
            RetakeAuthorization.student_id == student_id,
            RetakeAuthorization.question_list_id.in_(list_ids),
        )
    ).all()
    retakes_by_list: dict[UUID, list[RetakeAuthorization]] = defaultdict(list)
    for row in retake_rows:
        retakes_by_list[row.question_list_id].append(row)

    results: list[StudentListSummaryOut] = []
    for qlist, classroom_name, org_id, org_name, question_count in rows:
        list_subs = subs_by_list[qlist.id]
        attempts_used = len(list_subs)
        retake_status, _ = resolve_retake_state(retakes_by_list[qlist.id])
        can_attempt = (attempts_used == 0) or (retake_status == "approved")
        max_attempts_available = attempts_used + 1 if can_attempt else attempts_used
        latest_sub = list_subs[0] if list_subs else None
        is_unlocked = (
            qlist.is_standalone
            or qlist.visibility == "public"
            or (qlist.id in unlocked_ids)
        )
        visibility: VisibilityType = qlist.visibility  # type: ignore[assignment]

        results.append(
            StudentListSummaryOut(
                id=qlist.id,
                classroom_id=qlist.classroom_id,
                classroom_name=classroom_name,
                organization_id=org_id,
                organization_name=org_name,
                is_standalone=qlist.is_standalone,
                visibility=visibility,
                is_unlocked=is_unlocked,
                teacher_name=qlist.teacher.name,
                title=qlist.title,
                description=qlist.description,
                question_count=int(question_count),
                attempts_used=attempts_used,
                max_attempts_available_now=max_attempts_available,
                can_attempt=can_attempt,
                retake_status=retake_status,
                latest_submission_id=latest_sub.id if latest_sub else None,
                latest_score_percentage=float(latest_sub.score_percentage) if latest_sub else None,
            )
        )
    return results


def get_student_list_detail(
    db: Session,
    list_id: UUID,
    student_id: UUID,
) -> StudentListDetailOut:
    """Return a published list for an authorized student without exposing answer keys."""
    qlist = db.scalar(
        select(QuestionList)
        .options(
            joinedload(QuestionList.classroom).joinedload(Classroom.organization),
            joinedload(QuestionList.teacher),
            joinedload(QuestionList.questions).joinedload(Question.topic),
        )
        .where(QuestionList.id == list_id)
    )
    if qlist is None or not qlist.is_published:
        raise APIError(
            status_code=404,
            detail="Lista de questões não encontrada ou não publicada.",
            code="LIST_NOT_FOUND",
        )

    enforce_student_list_access(db, qlist, student_id, lock_enrollment=False)

    past_subs = db.scalars(
        select(Submission)
        .where(Submission.question_list_id == list_id, Submission.student_id == student_id)
        .order_by(Submission.attempt_number.desc())
    ).all()
    retakes = db.scalars(
        select(RetakeAuthorization).where(
            RetakeAuthorization.question_list_id == list_id,
            RetakeAuthorization.student_id == student_id,
        )
    ).all()

    attempts_used = len(past_subs)
    retake_status, _ = resolve_retake_state(retakes)
    can_attempt = (attempts_used == 0) or (retake_status == "approved")

    ordered_questions = sorted(qlist.questions, key=lambda q: (q.order_index, q.created_at))
    hierarchy = extract_list_hierarchy_meta(qlist)
    visibility: VisibilityType = qlist.visibility  # type: ignore[assignment]

    return StudentListDetailOut(
        id=qlist.id,
        classroom_id=hierarchy["classroom_id"],
        classroom_name=hierarchy["classroom_name"],
        organization_id=hierarchy["organization_id"],
        organization_name=hierarchy["organization_name"],
        is_standalone=hierarchy["is_standalone"],
        visibility=visibility,
        is_unlocked=True,
        teacher_name=qlist.teacher.name,
        title=qlist.title,
        description=qlist.description,
        attempts_used=attempts_used,
        next_attempt_number=attempts_used + 1,
        can_attempt=can_attempt,
        retake_status=retake_status,
        questions=[
            StudentQuestionOut(
                id=question.id,
                order_index=question.order_index,
                topic_id=question.topic_id,
                topic_name=question.topic.name,
                statement=question.statement,
                options=QuestionOptions(
                    A=question.option_a,
                    B=question.option_b,
                    C=question.option_c,
                    D=question.option_d,
                ),
            )
            for question in ordered_questions
        ],
        past_submissions=[
            StudentPastSubmissionItemOut(
                submission_id=sub.id,
                attempt_number=sub.attempt_number,
                score_percentage=float(sub.score_percentage),
                correct_count=sub.correct_count,
                total_questions=sub.total_questions,
                has_teacher_comment=bool(sub.teacher_comment),
                submitted_at=sub.submitted_at,
            )
            for sub in past_subs
        ],
    )


def unlock_student_list(
    db: Session,
    list_id: UUID,
    student_id: UUID,
    access_code: str,
) -> StudentListDetailOut:
    """Permanently unlock a private classroom question list with a valid access code."""
    qlist = db.scalar(
        select(QuestionList)
        .options(joinedload(QuestionList.classroom).joinedload(Classroom.organization))
        .where(QuestionList.id == list_id)
    )
    if qlist is None or not qlist.is_published:
        raise APIError(
            status_code=404,
            detail="Lista de questões não encontrada ou não publicada.",
            code="LIST_NOT_FOUND",
        )

    if not qlist.is_standalone:
        if qlist.classroom is not None and qlist.classroom.organization is not None:
            if qlist.classroom.organization.visibility == "private":
                require_organization_membership(
                    db,
                    qlist.classroom.organization.id,
                    student_id,
                    error_code="ORGANIZATION_ACCESS_REQUIRED",
                    error_detail="Este simulado pertence a uma organização privada. Entre na organização primeiro.",
                )

        enrolled = db.scalar(
            select(ClassroomEnrollment.id).where(
                ClassroomEnrollment.classroom_id == qlist.classroom_id,
                ClassroomEnrollment.student_id == student_id,
            )
        )
        if enrolled is None:
            raise APIError(
                status_code=403,
                detail="Você precisa estar matriculado nesta turma para desbloquear este simulado.",
                code="NOT_ENROLLED",
            )

    if qlist.is_standalone or qlist.visibility != "private":
        raise APIError(
            status_code=400,
            detail="Este simulado já é público e não requer código de acesso.",
            code="LIST_NOT_PRIVATE",
        )

    if not verify_access_code(access_code, qlist.access_code):
        raise APIError(
            status_code=403,
            detail="Código de acesso inválido para este simulado.",
            code="INVALID_ACCESS_CODE",
        )

    existing = db.scalar(
        select(QuestionListUnlock.id).where(
            QuestionListUnlock.question_list_id == list_id,
            QuestionListUnlock.student_id == student_id,
        )
    )
    if existing is None:
        unlock = QuestionListUnlock(question_list_id=list_id, student_id=student_id)
        db.add(unlock)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()

    return get_student_list_detail(db, list_id, student_id)
