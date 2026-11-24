from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal, ROUND_HALF_UP
import hashlib
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import APIError
from app.models.classroom import Classroom, ClassroomEnrollment
from app.models.organization import Organization, OrganizationMembership
from app.models.question_list import Question, QuestionList, QuestionListUnlock
from app.models.submission import RetakeAuthorization, Submission, SubmissionAnswer
from app.models.user import User
from app.schemas.analytics import TopicMetricOut
from app.schemas.question_list import OptionLetter, QuestionOptions, RetakeStatus
from app.schemas.submission import (
    PerformanceBand,
    QuestionFeedbackOut,
    RetakeDecideRequest,
    RetakeRequestCreate,
    RetakeRequestOut,
    StudentSubmissionSummaryOut,
    SubmissionCreate,
    SubmissionFeedbackOut,
    TeacherCommentUpdate,
)


def compute_performance_band(score_percentage: float) -> PerformanceBand:
    """Classify numeric score percentage into pedagogical performance bands."""
    if score_percentage >= 80.0:
        return "excellent"
    if score_percentage >= 60.0:
        return "good"
    if score_percentage >= 40.0:
        return "attention"
    return "critical"


def resolve_retake_state(retakes: Sequence[RetakeAuthorization]) -> tuple[RetakeStatus, UUID | None]:
    """Resolve API-facing retake status and optional pending request ID for a student/list pair."""
    ordered = sorted(retakes, key=lambda item: item.created_at, reverse=True)
    for item in ordered:
        if item.status == "pending":
            return "pending", item.id
    for item in ordered:
        if item.status == "approved":
            return "approved", None
    if ordered and ordered[0].status == "rejected":
        return "rejected", None
    return "none", None


def build_topic_metrics(items: Sequence[tuple[UUID, str, bool]]) -> list[TopicMetricOut]:
    """Aggregate answer correctness tuples (topic_id, topic_name, is_correct) by topic."""
    counts: dict[tuple[UUID, str], list[int]] = defaultdict(lambda: [0, 0])
    for topic_id, topic_name, is_correct in items:
        counts[(topic_id, topic_name)][0] += 1
        if is_correct:
            counts[(topic_id, topic_name)][1] += 1

    metrics: list[TopicMetricOut] = []
    for (topic_id, topic_name), (total, correct) in counts.items():
        wrong = total - correct
        accuracy = round((correct / total) * 100.0, 2) if total > 0 else 0.0
        metrics.append(
            TopicMetricOut(
                topic_id=topic_id,
                topic_name=topic_name,
                total_answers=total,
                correct_answers=correct,
                wrong_answers=wrong,
                accuracy_percentage=accuracy,
            )
        )

    metrics.sort(key=lambda item: (item.accuracy_percentage, -item.total_answers, item.topic_name))
    return metrics


def extract_list_hierarchy_meta(qlist: QuestionList) -> dict:
    """Extract optional classroom and organization metadata from a QuestionList."""
    classroom = qlist.classroom
    organization = classroom.organization if classroom is not None else None
    return {
        "classroom_id": classroom.id if classroom is not None else None,
        "classroom_name": classroom.name if classroom is not None else None,
        "organization_id": organization.id if organization is not None else None,
        "organization_name": organization.name if organization is not None else None,
        "is_standalone": qlist.is_standalone,
    }


def _advisory_lock_keys(student_id: UUID, list_id: UUID) -> tuple[int, int]:
    """Compute deterministic signed 32-bit advisory lock keys for a (student, list) pair."""
    digest = hashlib.sha256(f"{student_id}:{list_id}".encode("utf-8")).digest()
    k1 = int.from_bytes(digest[0:4], "big", signed=True)
    k2 = int.from_bytes(digest[4:8], "big", signed=True)
    return k1, k2


def _acquire_student_list_submission_lock(db: Session, student_id: UUID, list_id: UUID) -> None:
    """Acquire a transaction-scoped PostgreSQL advisory lock for (student_id, list_id)."""
    k1, k2 = _advisory_lock_keys(student_id, list_id)
    db.execute(text("SELECT pg_advisory_xact_lock(:k1, :k2)"), {"k1": k1, "k2": k2})


def enforce_student_list_access(
    db: Session,
    qlist: QuestionList,
    student_id: UUID,
    *,
    lock_enrollment: bool = False,
) -> None:
    """Verify private organization membership, classroom enrollment, and private list unlock."""
    if qlist.is_standalone:
        return

    classroom = db.get(Classroom, qlist.classroom_id)
    if classroom is None:
        raise APIError(status_code=404, detail="Turma não encontrada.", code="CLASSROOM_NOT_FOUND")

    if classroom.organization_id is not None:
        org = db.get(Organization, classroom.organization_id)
        if org is not None and org.visibility == "private":
            org_member = db.scalar(
                select(OrganizationMembership.id).where(
                    OrganizationMembership.organization_id == org.id,
                    OrganizationMembership.user_id == student_id,
                )
            )
            if org_member is None:
                raise APIError(
                    status_code=403,
                    detail="Este simulado pertence a uma organização privada. Entre na organização primeiro.",
                    code="ORGANIZATION_ACCESS_REQUIRED",
                )

    enroll_stmt = select(ClassroomEnrollment).where(
        ClassroomEnrollment.classroom_id == qlist.classroom_id,
        ClassroomEnrollment.student_id == student_id,
    )
    if lock_enrollment:
        enroll_stmt = enroll_stmt.with_for_update()

    enrollment = db.scalar(enroll_stmt)
    if enrollment is None:
        raise APIError(
            status_code=403,
            detail="Você precisa estar matriculado nesta turma para acessar a lista.",
            code="NOT_ENROLLED",
        )

    if qlist.visibility == "private":
        unlock = db.scalar(
            select(QuestionListUnlock.id).where(
                QuestionListUnlock.question_list_id == qlist.id,
                QuestionListUnlock.student_id == student_id,
            )
        )
        if unlock is None:
            raise APIError(
                status_code=403,
                detail="Este simulado é privado. Insira o código de acesso para desbloquear as questões.",
                code="LIST_LOCKED",
            )


def _get_submission_with_details(db: Session, submission_id: UUID) -> Submission:
    submission = db.scalar(
        select(Submission)
        .options(
            joinedload(Submission.question_list)
            .joinedload(QuestionList.classroom)
            .joinedload(Classroom.organization),
            joinedload(Submission.student),
            joinedload(Submission.answers).joinedload(SubmissionAnswer.question).joinedload(Question.topic),
        )
        .where(Submission.id == submission_id)
    )
    if submission is None:
        raise APIError(status_code=404, detail="Submissão não encontrada.", code="SUBMISSION_NOT_FOUND")
    return submission


def build_submission_feedback(db: Session, submission_id: UUID) -> SubmissionFeedbackOut:
    """Build detailed feedback response for a submission."""
    submission = _get_submission_with_details(db, submission_id)
    qlist = submission.question_list
    student = submission.student
    hierarchy = extract_list_hierarchy_meta(qlist)

    attempts_used_total = int(
        db.scalar(
            select(func.count(Submission.id)).where(
                Submission.question_list_id == qlist.id,
                Submission.student_id == student.id,
            )
        )
        or 0
    )
    retakes = db.scalars(
        select(RetakeAuthorization).where(
            RetakeAuthorization.question_list_id == qlist.id,
            RetakeAuthorization.student_id == student.id,
        )
    ).all()
    retake_status, pending_request_id = resolve_retake_state(retakes)

    ordered_answers = sorted(
        submission.answers,
        key=lambda ans: (ans.question.order_index, ans.question.created_at),
    )

    topic_inputs: list[tuple[UUID, str, bool]] = []
    questions_feedback: list[QuestionFeedbackOut] = []

    for ans in ordered_answers:
        question = ans.question
        topic = question.topic
        topic_inputs.append((topic.id, topic.name, ans.is_correct))
        selected_opt: OptionLetter = ans.selected_option  # type: ignore[assignment]
        correct_opt: OptionLetter = question.correct_option  # type: ignore[assignment]
        questions_feedback.append(
            QuestionFeedbackOut(
                question_id=question.id,
                order_index=question.order_index,
                topic_id=topic.id,
                topic_name=topic.name,
                statement=question.statement,
                options=QuestionOptions(
                    A=question.option_a,
                    B=question.option_b,
                    C=question.option_c,
                    D=question.option_d,
                ),
                selected_option=selected_opt,
                correct_option=correct_opt,
                is_correct=ans.is_correct,
                explanation=question.explanation,
            )
        )

    score = float(submission.score_percentage)
    return SubmissionFeedbackOut(
        submission_id=submission.id,
        question_list_id=qlist.id,
        question_list_title=qlist.title,
        classroom_id=hierarchy["classroom_id"],
        classroom_name=hierarchy["classroom_name"],
        organization_id=hierarchy["organization_id"],
        organization_name=hierarchy["organization_name"],
        is_standalone=hierarchy["is_standalone"],
        student_id=student.id,
        student_name=student.name,
        student_email=student.email,
        attempt_number=submission.attempt_number,
        attempts_used_total=attempts_used_total,
        correct_count=submission.correct_count,
        total_questions=submission.total_questions,
        score_percentage=score,
        performance_band=compute_performance_band(score),
        teacher_comment=submission.teacher_comment,
        teacher_commented_at=submission.teacher_commented_at,
        retake_status=retake_status,
        pending_retake_request_id=pending_request_id,
        can_authorize_retake=retake_status != "approved",
        can_attempt=retake_status == "approved",
        submitted_at=submission.submitted_at,
        topic_breakdown=build_topic_metrics(topic_inputs),
        questions_feedback=questions_feedback,
    )


def submit_list(
    db: Session,
    list_id: UUID,
    student_id: UUID,
    payload: SubmissionCreate,
) -> SubmissionFeedbackOut:
    """Grade and persist a full question-list attempt transactionally."""
    # Acquire FOR SHARE on QuestionList before checking access/locking to avoid races with question edits
    question_list = db.scalar(
        select(QuestionList)
        .where(QuestionList.id == list_id)
        .with_for_update(read=True)
    )
    if question_list is None or not question_list.is_published:
        raise APIError(
            status_code=404,
            detail="Simulado não encontrado ou ainda não publicado.",
            code="LIST_NOT_FOUND",
        )

    enforce_student_list_access(db, question_list, student_id, lock_enrollment=True)

    # Transaction-scoped advisory lock serializes concurrent submissions (including standalone lists)
    _acquire_student_list_submission_lock(db, student_id, list_id)

    questions = db.scalars(
        select(Question)
        .where(Question.question_list_id == list_id)
        .order_by(Question.order_index.asc(), Question.created_at.asc())
    ).all()
    if not questions:
        raise APIError(
            status_code=422,
            detail="A lista não possui questões cadastradas.",
            code="EMPTY_LIST",
        )

    answer_map: dict[UUID, str] = {}
    for item in payload.answers:
        if item.question_id in answer_map:
            raise APIError(
                status_code=422,
                detail="Respostas duplicadas detectadas para a mesma questão.",
                code="INVALID_ANSWERS",
            )
        answer_map[item.question_id] = item.selected_option

    expected_ids = {question.id for question in questions}
    if set(answer_map.keys()) != expected_ids:
        raise APIError(
            status_code=422,
            detail="Todas as questões da lista devem ser respondidas exatamente uma vez.",
            code="INVALID_ANSWERS",
        )

    attempts_used = int(
        db.scalar(
            select(func.count(Submission.id)).where(
                Submission.question_list_id == list_id,
                Submission.student_id == student_id,
            )
        )
        or 0
    )

    if attempts_used == 0:
        attempt_number = 1
    else:
        approved_retake = db.scalar(
            select(RetakeAuthorization)
            .where(
                RetakeAuthorization.question_list_id == list_id,
                RetakeAuthorization.student_id == student_id,
                RetakeAuthorization.status == "approved",
            )
            .with_for_update()
        )
        if approved_retake is None:
            raise APIError(
                status_code=403,
                detail="Você já realizou esta lista. Solicite autorização ao professor para refazer.",
                code="RETAKE_AUTHORIZATION_REQUIRED",
            )
        approved_retake.status = "consumed"
        approved_retake.consumed_at = datetime.now(UTC)
        attempt_number = attempts_used + 1

    total_questions = len(questions)
    correct_count = 0
    answer_rows: list[SubmissionAnswer] = []

    for question in questions:
        selected = answer_map[question.id]
        is_correct = selected == question.correct_option
        if is_correct:
            correct_count += 1
        answer_rows.append(
            SubmissionAnswer(
                question_id=question.id,
                selected_option=selected,
                is_correct=is_correct,
            )
        )

    score_decimal = (
        Decimal(correct_count * 100) / Decimal(total_questions)
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    submission = Submission(
        question_list_id=list_id,
        student_id=student_id,
        attempt_number=attempt_number,
        correct_count=correct_count,
        total_questions=total_questions,
        score_percentage=score_decimal,
        answers=answer_rows,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    return build_submission_feedback(db, submission.id)


def list_student_submissions(db: Session, student_id: UUID) -> list[StudentSubmissionSummaryOut]:
    """Return chronological submission history for the authenticated student."""
    submissions = db.scalars(
        select(Submission)
        .options(
            joinedload(Submission.question_list)
            .joinedload(QuestionList.classroom)
            .joinedload(Classroom.organization)
        )
        .where(Submission.student_id == student_id)
        .order_by(Submission.submitted_at.desc(), Submission.attempt_number.desc())
    ).all()

    if not submissions:
        return []

    list_ids = list({sub.question_list_id for sub in submissions})
    attempt_counts_rows = db.execute(
        select(Submission.question_list_id, func.count(Submission.id))
        .where(Submission.student_id == student_id, Submission.question_list_id.in_(list_ids))
        .group_by(Submission.question_list_id)
    ).all()
    attempts_by_list = {qlist_id: int(count) for qlist_id, count in attempt_counts_rows}

    retake_rows = db.scalars(
        select(RetakeAuthorization).where(
            RetakeAuthorization.student_id == student_id,
            RetakeAuthorization.question_list_id.in_(list_ids),
        )
    ).all()
    retakes_by_list: dict[UUID, list[RetakeAuthorization]] = defaultdict(list)
    for row in retake_rows:
        retakes_by_list[row.question_list_id].append(row)

    results: list[StudentSubmissionSummaryOut] = []
    for sub in submissions:
        qlist = sub.question_list
        hierarchy = extract_list_hierarchy_meta(qlist)
        retake_status, _ = resolve_retake_state(retakes_by_list[qlist.id])
        score = float(sub.score_percentage)
        results.append(
            StudentSubmissionSummaryOut(
                submission_id=sub.id,
                question_list_id=qlist.id,
                question_list_title=qlist.title,
                classroom_id=hierarchy["classroom_id"],
                classroom_name=hierarchy["classroom_name"],
                organization_id=hierarchy["organization_id"],
                organization_name=hierarchy["organization_name"],
                is_standalone=hierarchy["is_standalone"],
                attempt_number=sub.attempt_number,
                attempts_used_total=attempts_by_list.get(qlist.id, sub.attempt_number),
                correct_count=sub.correct_count,
                total_questions=sub.total_questions,
                score_percentage=score,
                performance_band=compute_performance_band(score),
                has_teacher_comment=bool(sub.teacher_comment),
                retake_status=retake_status,
                can_attempt=retake_status == "approved",
                submitted_at=sub.submitted_at,
            )
        )
    return results


def get_student_submission_feedback(
    db: Session, submission_id: UUID, student_id: UUID
) -> SubmissionFeedbackOut:
    """Fetch submission feedback verifying student ownership."""
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise APIError(status_code=404, detail="Submissão não encontrada.", code="SUBMISSION_NOT_FOUND")
    if submission.student_id != student_id:
        raise APIError(
            status_code=403,
            detail="Você não tem permissão para visualizar esta avaliação.",
            code="FORBIDDEN_SUBMISSION",
        )
    return build_submission_feedback(db, submission_id)


def get_teacher_submission_feedback(
    db: Session, submission_id: UUID, teacher_id: UUID
) -> SubmissionFeedbackOut:
    """Fetch submission feedback verifying teacher ownership of the question list."""
    submission = db.scalar(
        select(Submission)
        .options(joinedload(Submission.question_list))
        .where(Submission.id == submission_id)
    )
    if submission is None:
        raise APIError(status_code=404, detail="Submissão não encontrada.", code="SUBMISSION_NOT_FOUND")
    if submission.question_list.teacher_id != teacher_id:
        raise APIError(
            status_code=403,
            detail="Você não tem permissão para visualizar esta submissão.",
            code="FORBIDDEN_SUBMISSION",
        )
    return build_submission_feedback(db, submission_id)


def update_teacher_comment(
    db: Session,
    submission_id: UUID,
    teacher_id: UUID,
    payload: TeacherCommentUpdate,
) -> SubmissionFeedbackOut:
    """Set or clear a manual pedagogical comment on a student submission."""
    submission = db.scalar(
        select(Submission)
        .options(joinedload(Submission.question_list))
        .where(Submission.id == submission_id)
    )
    if submission is None:
        raise APIError(status_code=404, detail="Submissão não encontrada.", code="SUBMISSION_NOT_FOUND")
    if submission.question_list.teacher_id != teacher_id:
        raise APIError(
            status_code=403,
            detail="Você não tem permissão para comentar nesta submissão.",
            code="FORBIDDEN_SUBMISSION",
        )

    if payload.teacher_comment is None:
        submission.teacher_comment = None
        submission.teacher_commented_at = None
        submission.teacher_commented_by = None
    else:
        submission.teacher_comment = payload.teacher_comment
        submission.teacher_commented_at = datetime.now(UTC)
        submission.teacher_commented_by = teacher_id

    db.commit()
    return build_submission_feedback(db, submission.id)


def _build_retake_request_out(db: Session, retake: RetakeAuthorization) -> RetakeRequestOut:
    qlist = retake.question_list or db.scalar(
        select(QuestionList)
        .options(joinedload(QuestionList.classroom).joinedload(Classroom.organization))
        .where(QuestionList.id == retake.question_list_id)
    )
    student = retake.student or db.get(User, retake.student_id)
    hierarchy = extract_list_hierarchy_meta(qlist)

    student_subs = db.scalars(
        select(Submission)
        .where(
            Submission.question_list_id == retake.question_list_id,
            Submission.student_id == retake.student_id,
        )
        .order_by(Submission.attempt_number.desc())
    ).all()
    attempts_used = len(student_subs)
    last_score = float(student_subs[0].score_percentage) if student_subs else 0.0

    return RetakeRequestOut(
        id=retake.id,
        question_list_id=qlist.id,
        question_list_title=qlist.title,
        classroom_id=hierarchy["classroom_id"],
        classroom_name=hierarchy["classroom_name"],
        organization_id=hierarchy["organization_id"],
        organization_name=hierarchy["organization_name"],
        is_standalone=hierarchy["is_standalone"],
        student_id=student.id,
        student_name=student.name,
        student_email=student.email,
        attempts_used=attempts_used,
        last_score_percentage=last_score,
        status=retake.status,  # type: ignore[arg-type]
        request_reason=retake.request_reason,
        created_at=retake.created_at,
        reviewed_at=retake.reviewed_at,
    )


def create_retake_request(
    db: Session,
    list_id: UUID,
    student_id: UUID,
    payload: RetakeRequestCreate,
) -> RetakeRequestOut:
    """Create a pending student retake request for a previously submitted list."""
    question_list = db.scalar(
        select(QuestionList)
        .options(joinedload(QuestionList.classroom).joinedload(Classroom.organization))
        .where(QuestionList.id == list_id)
    )
    if question_list is None or not question_list.is_published:
        raise APIError(status_code=404, detail="Lista de questões não encontrada.", code="LIST_NOT_FOUND")

    enforce_student_list_access(db, question_list, student_id, lock_enrollment=False)

    attempts_used = int(
        db.scalar(
            select(func.count(Submission.id)).where(
                Submission.question_list_id == list_id,
                Submission.student_id == student_id,
            )
        )
        or 0
    )
    if attempts_used == 0:
        raise APIError(
            status_code=400,
            detail="Você precisa entregar a primeira tentativa antes de solicitar uma nova tentativa.",
            code="NO_PRIOR_SUBMISSION",
        )

    active = db.scalar(
        select(RetakeAuthorization).where(
            RetakeAuthorization.question_list_id == list_id,
            RetakeAuthorization.student_id == student_id,
            RetakeAuthorization.status.in_(["pending", "approved"]),
        )
    )
    if active is not None:
        raise APIError(
            status_code=409,
            detail="Já existe uma solicitação pendente ou autorização ativa para esta lista.",
            code="RETAKE_ALREADY_ACTIVE",
        )

    retake = RetakeAuthorization(
        question_list_id=list_id,
        student_id=student_id,
        status="pending",
        requested_by_student=True,
        request_reason=payload.reason,
    )
    db.add(retake)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIError(
            status_code=409,
            detail="Já existe uma solicitação pendente ou autorização ativa para esta lista.",
            code="RETAKE_ALREADY_ACTIVE",
        )

    db.refresh(retake)
    retake.question_list = question_list
    return _build_retake_request_out(db, retake)


def list_teacher_retake_requests(
    db: Session,
    teacher_id: UUID,
    status_filter: str = "pending",
) -> list[RetakeRequestOut]:
    """List retake authorizations/requests for lists owned by the teacher."""
    valid_statuses = {"pending", "approved", "rejected", "consumed", "all"}
    if status_filter not in valid_statuses:
        raise APIError(
            status_code=422,
            detail="Filtro de status inválido.",
            code="INVALID_STATUS_FILTER",
        )

    stmt = (
        select(RetakeAuthorization)
        .join(QuestionList, QuestionList.id == RetakeAuthorization.question_list_id)
        .options(
            joinedload(RetakeAuthorization.question_list)
            .joinedload(QuestionList.classroom)
            .joinedload(Classroom.organization),
            joinedload(RetakeAuthorization.student),
        )
        .where(QuestionList.teacher_id == teacher_id)
        .order_by(RetakeAuthorization.created_at.desc())
    )
    if status_filter != "all":
        stmt = stmt.where(RetakeAuthorization.status == status_filter)

    rows = db.scalars(stmt).all()
    if not rows:
        return []

    list_ids = list({row.question_list_id for row in rows})
    student_ids = list({row.student_id for row in rows})
    submissions = db.scalars(
        select(Submission)
        .where(
            Submission.question_list_id.in_(list_ids),
            Submission.student_id.in_(student_ids),
        )
        .order_by(Submission.attempt_number.desc())
    ).all()

    subs_by_pair: dict[tuple[UUID, UUID], list[Submission]] = defaultdict(list)
    for sub in submissions:
        subs_by_pair[(sub.question_list_id, sub.student_id)].append(sub)

    result: list[RetakeRequestOut] = []
    for row in rows:
        pair_subs = subs_by_pair[(row.question_list_id, row.student_id)]
        attempts_used = len(pair_subs)
        last_score = float(pair_subs[0].score_percentage) if pair_subs else 0.0
        hierarchy = extract_list_hierarchy_meta(row.question_list)
        result.append(
            RetakeRequestOut(
                id=row.id,
                question_list_id=row.question_list.id,
                question_list_title=row.question_list.title,
                classroom_id=hierarchy["classroom_id"],
                classroom_name=hierarchy["classroom_name"],
                organization_id=hierarchy["organization_id"],
                organization_name=hierarchy["organization_name"],
                is_standalone=hierarchy["is_standalone"],
                student_id=row.student.id,
                student_name=row.student.name,
                student_email=row.student.email,
                attempts_used=attempts_used,
                last_score_percentage=last_score,
                status=row.status,  # type: ignore[arg-type]
                request_reason=row.request_reason,
                created_at=row.created_at,
                reviewed_at=row.reviewed_at,
            )
        )
    return result


def decide_retake_request(
    db: Session,
    request_id: UUID,
    teacher_id: UUID,
    payload: RetakeDecideRequest,
) -> RetakeRequestOut:
    """Approve or reject a pending student retake request."""
    retake = db.scalar(
        select(RetakeAuthorization)
        .options(
            joinedload(RetakeAuthorization.question_list)
            .joinedload(QuestionList.classroom)
            .joinedload(Classroom.organization),
            joinedload(RetakeAuthorization.student),
        )
        .where(RetakeAuthorization.id == request_id)
        .with_for_update(of=RetakeAuthorization)
    )
    if retake is None:
        raise APIError(
            status_code=404,
            detail="Solicitação de nova tentativa não encontrada.",
            code="RETAKE_REQUEST_NOT_FOUND",
        )
    if retake.question_list.teacher_id != teacher_id:
        raise APIError(
            status_code=403,
            detail="Você não tem permissão para responder a esta solicitação.",
            code="FORBIDDEN_RETAKE_REQUEST",
        )
    if retake.status != "pending":
        raise APIError(
            status_code=409,
            detail="Esta solicitação já foi analisada ou consumida.",
            code="RETAKE_ALREADY_DECIDED",
        )

    retake.status = payload.decision
    retake.reviewed_by_teacher_id = teacher_id
    retake.reviewed_at = datetime.now(UTC)
    db.commit()
    db.refresh(retake)
    return _build_retake_request_out(db, retake)


def authorize_retake_proactively(
    db: Session,
    list_id: UUID,
    student_id: UUID,
    teacher_id: UUID,
) -> RetakeRequestOut:
    """Proactively grant a retake (or approve pending request) idempotently."""
    question_list = db.scalar(
        select(QuestionList)
        .options(joinedload(QuestionList.classroom).joinedload(Classroom.organization))
        .where(QuestionList.id == list_id)
    )
    if question_list is None:
        raise APIError(status_code=404, detail="Lista de questões não encontrada.", code="LIST_NOT_FOUND")
    if question_list.teacher_id != teacher_id:
        raise APIError(
            status_code=403,
            detail="Você não tem permissão para liberar tentativas nesta lista.",
            code="FORBIDDEN_LIST",
        )

    student = db.get(User, student_id)
    if student is None or student.role != "student":
        raise APIError(status_code=404, detail="Aluno não encontrado.", code="STUDENT_NOT_FOUND")

    if not question_list.is_standalone:
        enrollment = db.scalar(
            select(ClassroomEnrollment)
            .where(
                ClassroomEnrollment.classroom_id == question_list.classroom_id,
                ClassroomEnrollment.student_id == student_id,
            )
            .with_for_update()
        )
        if enrollment is None:
            raise APIError(
                status_code=400,
                detail="O aluno não está matriculado na turma desta lista.",
                code="STUDENT_NOT_ENROLLED",
            )

    _acquire_student_list_submission_lock(db, student_id, list_id)

    attempts_used = int(
        db.scalar(
            select(func.count(Submission.id)).where(
                Submission.question_list_id == list_id,
                Submission.student_id == student_id,
            )
        )
        or 0
    )
    if attempts_used == 0:
        raise APIError(
            status_code=400,
            detail="O aluno ainda não concluiu a primeira tentativa desta lista.",
            code="NO_PRIOR_SUBMISSION",
        )

    active = db.scalar(
        select(RetakeAuthorization)
        .options(
            joinedload(RetakeAuthorization.question_list)
            .joinedload(QuestionList.classroom)
            .joinedload(Classroom.organization),
            joinedload(RetakeAuthorization.student),
        )
        .where(
            RetakeAuthorization.question_list_id == list_id,
            RetakeAuthorization.student_id == student_id,
            RetakeAuthorization.status.in_(["pending", "approved"]),
        )
        .with_for_update(of=RetakeAuthorization)
    )

    if active is not None:
        if active.status == "approved":
            return _build_retake_request_out(db, active)
        active.status = "approved"
        active.reviewed_by_teacher_id = teacher_id
        active.reviewed_at = datetime.now(UTC)
        db.commit()
        db.refresh(active)
        return _build_retake_request_out(db, active)

    retake = RetakeAuthorization(
        question_list_id=list_id,
        student_id=student_id,
        status="approved",
        requested_by_student=False,
        reviewed_by_teacher_id=teacher_id,
        reviewed_at=datetime.now(UTC),
    )
    db.add(retake)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing_active = db.scalar(
            select(RetakeAuthorization)
            .options(
                joinedload(RetakeAuthorization.question_list)
                .joinedload(QuestionList.classroom)
                .joinedload(Classroom.organization),
                joinedload(RetakeAuthorization.student),
            )
            .where(
                RetakeAuthorization.question_list_id == list_id,
                RetakeAuthorization.student_id == student_id,
                RetakeAuthorization.status.in_(["pending", "approved"]),
            )
        )
        if existing_active is not None:
            return _build_retake_request_out(db, existing_active)
        raise

    db.refresh(retake)
    retake.question_list = question_list
    retake.student = student
    return _build_retake_request_out(db, retake)
