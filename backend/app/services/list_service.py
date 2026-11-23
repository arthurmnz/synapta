from collections import defaultdict
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import APIError
from app.models.classroom import Classroom, ClassroomEnrollment
from app.models.question_list import Question, QuestionList
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
from app.services.classroom_service import get_owned_classroom
from app.services.submission_service import resolve_retake_state


def _get_owned_list(db: Session, list_id: UUID, teacher_id: UUID) -> QuestionList:
    qlist = db.scalar(
        select(QuestionList)
        .options(
            joinedload(QuestionList.classroom),
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
    return TeacherListDetailOut(
        id=qlist.id,
        classroom_id=qlist.classroom_id,
        classroom_name=qlist.classroom.name,
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
    classroom_id: UUID | None = None,
) -> list[TeacherListSummaryOut]:
    """List question lists owned by the teacher, optionally filtered by classroom."""
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
            func.coalesce(question_counts.c.question_count, 0).label("question_count"),
            func.coalesce(submission_counts.c.submission_count, 0).label("submission_count"),
        )
        .join(Classroom, Classroom.id == QuestionList.classroom_id)
        .outerjoin(question_counts, question_counts.c.list_id == QuestionList.id)
        .outerjoin(submission_counts, submission_counts.c.list_id == QuestionList.id)
        .where(QuestionList.teacher_id == teacher_id)
        .order_by(QuestionList.created_at.desc(), QuestionList.title.asc())
    )
    if classroom_id is not None:
        stmt = stmt.where(QuestionList.classroom_id == classroom_id)

    rows = db.execute(stmt).all()
    return [
        TeacherListSummaryOut(
            id=qlist.id,
            classroom_id=qlist.classroom_id,
            classroom_name=classroom_name,
            title=qlist.title,
            description=qlist.description,
            is_published=qlist.is_published,
            question_count=int(question_count),
            submission_count=int(submission_count),
            created_at=qlist.created_at,
            updated_at=qlist.updated_at,
        )
        for qlist, classroom_name, question_count, submission_count in rows
    ]


def create_teacher_list(
    db: Session,
    teacher_id: UUID,
    payload: QuestionListCreate,
) -> TeacherListDetailOut:
    """Create a draft question list inside a teacher-owned classroom."""
    classroom = get_owned_classroom(db, payload.classroom_id, teacher_id)
    qlist = QuestionList(
        classroom_id=classroom.id,
        teacher_id=teacher_id,
        title=payload.title,
        description=payload.description,
        is_published=False,
    )
    db.add(qlist)
    db.commit()
    db.refresh(qlist)
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
    """Update question list metadata or publication status."""
    qlist = _get_owned_list(db, list_id, teacher_id)
    data = payload.model_dump(exclude_unset=True)

    if data.get("is_published") is True and len(qlist.questions) == 0:
        raise APIError(
            status_code=422,
            detail="Não é possível publicar uma lista sem questões cadastradas.",
            code="EMPTY_LIST_CANNOT_PUBLISH",
        )

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
    classroom_id: UUID | None = None,
) -> list[StudentListSummaryOut]:
    """List published question lists across the student's enrolled classrooms."""
    if classroom_id is not None:
        classroom = db.get(Classroom, classroom_id)
        if classroom is None:
            raise APIError(status_code=404, detail="Turma não encontrada.", code="CLASSROOM_NOT_FOUND")
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
            func.coalesce(question_counts.c.question_count, 0).label("question_count"),
        )
        .join(Classroom, Classroom.id == QuestionList.classroom_id)
        .join(ClassroomEnrollment, ClassroomEnrollment.classroom_id == Classroom.id)
        .outerjoin(question_counts, question_counts.c.list_id == QuestionList.id)
        .options(joinedload(QuestionList.teacher))
        .where(
            ClassroomEnrollment.student_id == student_id,
            QuestionList.is_published.is_(True),
        )
        .order_by(QuestionList.created_at.desc(), QuestionList.title.asc())
    )
    if classroom_id is not None:
        stmt = stmt.where(QuestionList.classroom_id == classroom_id)

    rows = db.execute(stmt).all()
    if not rows:
        return []

    list_ids = [qlist.id for qlist, _, _ in rows]

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
    for qlist, classroom_name, question_count in rows:
        list_subs = subs_by_list[qlist.id]
        attempts_used = len(list_subs)
        retake_status, _ = resolve_retake_state(retakes_by_list[qlist.id])
        can_attempt = (attempts_used == 0) or (retake_status == "approved")
        max_attempts_available = attempts_used + 1 if can_attempt else attempts_used
        latest_sub = list_subs[0] if list_subs else None

        results.append(
            StudentListSummaryOut(
                id=qlist.id,
                classroom_id=qlist.classroom_id,
                classroom_name=classroom_name,
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
    """Return a published list for an enrolled student without exposing answer keys."""
    qlist = db.scalar(
        select(QuestionList)
        .options(
            joinedload(QuestionList.classroom),
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

    enrollment = db.scalar(
        select(ClassroomEnrollment).where(
            ClassroomEnrollment.classroom_id == qlist.classroom_id,
            ClassroomEnrollment.student_id == student_id,
        )
    )
    if enrollment is None:
        raise APIError(
            status_code=403,
            detail="Você precisa estar matriculado nesta turma para acessar a lista.",
            code="NOT_ENROLLED",
        )

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

    return StudentListDetailOut(
        id=qlist.id,
        classroom_id=qlist.classroom_id,
        classroom_name=qlist.classroom.name,
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
