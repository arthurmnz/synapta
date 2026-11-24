from collections import defaultdict
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import APIError
from app.models.classroom import Classroom, ClassroomEnrollment
from app.models.organization import Organization, OrganizationMembership
from app.models.question_list import Question, QuestionList
from app.models.submission import RetakeAuthorization, Submission, SubmissionAnswer
from app.models.topic import Topic
from app.models.user import User
from app.schemas.analytics import (
    StandaloneListAnalyticsOut,
    TeacherKpisOut,
    TeacherStudentDetailOut,
    TeacherStudentInfoOut,
    TeacherStudentProfileSummaryOut,
    TeacherStudentSubmissionItemOut,
    TeacherStudentSummaryOut,
    TeacherTopicAnalyticsOut,
    TopicMetricOut,
)
from app.schemas.classroom import ClassroomRefOut
from app.schemas.organization import VisibilityType
from app.services.classroom_service import get_owned_classroom
from app.services.organization_service import require_organization_membership
from app.services.submission_service import (
    build_topic_metrics,
    extract_list_hierarchy_meta,
    resolve_retake_state,
)

AnalyticsListType = Literal["all", "classroom", "standalone"]


def _validate_analytics_scope(
    db: Session,
    teacher_id: UUID,
    organization_id: UUID | None,
    classroom_id: UUID | None,
    list_id: UUID | None,
) -> tuple[Classroom | None, QuestionList | None]:
    if organization_id is not None:
        require_organization_membership(
            db,
            organization_id,
            teacher_id,
            allowed_roles=("owner", "teacher"),
            error_code="FORBIDDEN_ORGANIZATION",
            error_detail="Você não tem permissão para visualizar métricas desta organização.",
        )

    classroom: Classroom | None = None
    if classroom_id is not None:
        classroom = get_owned_classroom(db, classroom_id, teacher_id)

    qlist: QuestionList | None = None
    if list_id is not None:
        qlist = db.scalar(
            select(QuestionList)
            .options(joinedload(QuestionList.classroom))
            .where(QuestionList.id == list_id)
        )
        if qlist is None:
            raise APIError(
                status_code=404, detail="Lista de questões não encontrada.", code="LIST_NOT_FOUND"
            )
        if qlist.teacher_id != teacher_id:
            raise APIError(
                status_code=403,
                detail="Você não tem permissão para visualizar métricas desta lista.",
                code="FORBIDDEN_LIST",
            )

    return classroom, qlist


def _apply_list_filters(
    stmt: Any,
    teacher_id: UUID,
    organization_id: UUID | None,
    classroom_id: UUID | None,
    list_id: UUID | None,
    list_type: AnalyticsListType,
) -> Any:
    stmt = stmt.where(QuestionList.teacher_id == teacher_id)
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
    if list_id is not None:
        stmt = stmt.where(QuestionList.id == list_id)
    return stmt


def get_teacher_topic_analytics(
    db: Session,
    teacher_id: UUID,
    organization_id: UUID | None = None,
    classroom_id: UUID | None = None,
    list_id: UUID | None = None,
    list_type: AnalyticsListType = "all",
    scope: Literal["latest", "all"] = "latest",
) -> TeacherTopicAnalyticsOut:
    """Aggregate KPIs, topic accuracy, and standalone list metrics for a teacher."""
    classroom, qlist = _validate_analytics_scope(
        db, teacher_id, organization_id, classroom_id, list_id
    )

    filtering_standalone_only = list_type == "standalone" or (
        qlist is not None and qlist.is_standalone
    )
    conflict_standalone_and_hierarchy = filtering_standalone_only and (
        organization_id is not None
        or classroom_id is not None
        or (qlist is not None and not qlist.is_standalone)
    )

    if filtering_standalone_only or conflict_standalone_and_hierarchy:
        scoped_classroom_ids: list[UUID] = []
    else:
        target_classroom_id = classroom_id
        if target_classroom_id is None and qlist is not None and not qlist.is_standalone:
            target_classroom_id = qlist.classroom_id

        classroom_stmt = select(Classroom.id).where(Classroom.teacher_id == teacher_id)
        if organization_id is not None:
            classroom_stmt = classroom_stmt.where(Classroom.organization_id == organization_id)
        if target_classroom_id is not None:
            classroom_stmt = classroom_stmt.where(Classroom.id == target_classroom_id)
        scoped_classroom_ids = list(db.scalars(classroom_stmt).all())

    if filtering_standalone_only or conflict_standalone_and_hierarchy:
        total_organizations = 0
    elif organization_id is not None:
        total_organizations = 1
    elif classroom is not None:
        total_organizations = 1 if classroom.organization_id is not None else 0
    elif qlist is not None and qlist.classroom is not None:
        total_organizations = 1 if qlist.classroom.organization_id is not None else 0
    else:
        total_organizations = int(
            db.scalar(
                select(func.count(OrganizationMembership.id)).where(
                    OrganizationMembership.user_id == teacher_id,
                    OrganizationMembership.member_role.in_(["owner", "teacher"]),
                )
            )
            or 0
        )

    student_ids_set: set[UUID] = set()
    if scoped_classroom_ids:
        student_ids_set.update(
            db.scalars(
                select(ClassroomEnrollment.student_id).where(
                    ClassroomEnrollment.classroom_id.in_(scoped_classroom_ids)
                )
            ).all()
        )
    if (
        list_type in ("all", "standalone")
        and organization_id is None
        and classroom_id is None
        and (qlist is None or qlist.is_standalone)
    ):
        standalone_student_stmt = (
            select(Submission.student_id)
            .join(QuestionList, QuestionList.id == Submission.question_list_id)
            .where(
                QuestionList.teacher_id == teacher_id,
                QuestionList.is_standalone.is_(True),
            )
        )
        if list_id is not None:
            standalone_student_stmt = standalone_student_stmt.where(QuestionList.id == list_id)
        student_ids_set.update(db.scalars(standalone_student_stmt).all())

    total_students = len(student_ids_set)

    published_stmt = _apply_list_filters(
        select(func.count(QuestionList.id))
        .outerjoin(Classroom, Classroom.id == QuestionList.classroom_id)
        .where(QuestionList.is_published.is_(True)),
        teacher_id,
        organization_id,
        classroom_id,
        list_id,
        list_type,
    )
    standalone_count_stmt = _apply_list_filters(
        select(func.count(QuestionList.id))
        .outerjoin(Classroom, Classroom.id == QuestionList.classroom_id)
        .where(QuestionList.is_published.is_(True), QuestionList.is_standalone.is_(True)),
        teacher_id,
        organization_id,
        classroom_id,
        list_id,
        list_type,
    )
    submissions_count_stmt = _apply_list_filters(
        select(func.count(Submission.id))
        .join(QuestionList, QuestionList.id == Submission.question_list_id)
        .outerjoin(Classroom, Classroom.id == QuestionList.classroom_id),
        teacher_id,
        organization_id,
        classroom_id,
        list_id,
        list_type,
    )
    pending_retake_stmt = _apply_list_filters(
        select(func.count(RetakeAuthorization.id))
        .join(QuestionList, QuestionList.id == RetakeAuthorization.question_list_id)
        .outerjoin(Classroom, Classroom.id == QuestionList.classroom_id)
        .where(RetakeAuthorization.status == "pending"),
        teacher_id,
        organization_id,
        classroom_id,
        list_id,
        list_type,
    )

    total_published_lists = int(db.scalar(published_stmt) or 0)
    total_standalone_lists = int(db.scalar(standalone_count_stmt) or 0)
    total_submissions = int(db.scalar(submissions_count_stmt) or 0)
    pending_retake_requests = int(db.scalar(pending_retake_stmt) or 0)

    ranked_subs = _apply_list_filters(
        select(
            Submission.id.label("submission_id"),
            func.row_number()
            .over(
                partition_by=(Submission.question_list_id, Submission.student_id),
                order_by=Submission.attempt_number.desc(),
            )
            .label("rn"),
        )
        .join(QuestionList, QuestionList.id == Submission.question_list_id)
        .outerjoin(Classroom, Classroom.id == QuestionList.classroom_id),
        teacher_id,
        organization_id,
        classroom_id,
        list_id,
        list_type,
    )

    ranked_subquery = ranked_subs.subquery()
    scoped_sub_ids = select(ranked_subquery.c.submission_id)
    if scope == "latest":
        scoped_sub_ids = scoped_sub_ids.where(ranked_subquery.c.rn == 1)

    topic_rows = db.execute(
        select(
            Topic.id,
            Topic.name,
            func.count(SubmissionAnswer.id).label("total_answers"),
            func.coalesce(
                func.sum(case((SubmissionAnswer.is_correct.is_(True), 1), else_=0)),
                0,
            ).label("correct_answers"),
        )
        .join(Question, Question.topic_id == Topic.id)
        .join(SubmissionAnswer, SubmissionAnswer.question_id == Question.id)
        .where(SubmissionAnswer.submission_id.in_(scoped_sub_ids))
        .group_by(Topic.id, Topic.name)
    ).all()

    topics: list[TopicMetricOut] = []
    grand_total = 0
    grand_correct = 0

    for topic_id, topic_name, total_ans_raw, correct_ans_raw in topic_rows:
        total_ans = int(total_ans_raw or 0)
        correct_ans = int(correct_ans_raw or 0)
        if total_ans == 0:
            continue
        wrong_ans = total_ans - correct_ans
        accuracy = round((correct_ans / total_ans) * 100.0, 2)
        grand_total += total_ans
        grand_correct += correct_ans
        topics.append(
            TopicMetricOut(
                topic_id=topic_id,
                topic_name=topic_name,
                total_answers=total_ans,
                correct_answers=correct_ans,
                wrong_answers=wrong_ans,
                accuracy_percentage=accuracy,
            )
        )

    topics.sort(key=lambda item: (item.accuracy_percentage, -item.total_answers, item.topic_name))
    lowest_performing = topics[:3]
    highest_performing = sorted(
        topics,
        key=lambda item: (-item.accuracy_percentage, -item.total_answers, item.topic_name),
    )[:3]

    overall_accuracy = round((grand_correct / grand_total) * 100.0, 2) if grand_total > 0 else 0.0

    standalone_lists_out: list[StandaloneListAnalyticsOut] = []
    if (
        list_type in ("all", "standalone")
        and organization_id is None
        and classroom_id is None
        and (qlist is None or qlist.is_standalone)
    ):
        standalone_stmt = (
            select(QuestionList)
            .where(
                QuestionList.teacher_id == teacher_id,
                QuestionList.is_standalone.is_(True),
                QuestionList.is_published.is_(True),
            )
            .order_by(QuestionList.title.asc())
        )
        if list_id is not None:
            standalone_stmt = standalone_stmt.where(QuestionList.id == list_id)

        standalone_lists = db.scalars(standalone_stmt).all()
        if standalone_lists:
            standalone_ids = [item.id for item in standalone_lists]
            standalone_subs = db.scalars(
                select(Submission)
                .where(Submission.question_list_id.in_(standalone_ids))
                .order_by(Submission.attempt_number.desc())
            ).all()
            subs_by_standalone: dict[UUID, list[Submission]] = defaultdict(list)
            for sub in standalone_subs:
                subs_by_standalone[sub.question_list_id].append(sub)

            for item in standalone_lists:
                item_subs = subs_by_standalone[item.id]
                distinct_students = {sub.student_id for sub in item_subs}
                if scope == "latest":
                    latest_per_student: dict[UUID, Submission] = {}
                    for sub in item_subs:
                        existing = latest_per_student.get(sub.student_id)
                        if existing is None or sub.attempt_number > existing.attempt_number:
                            latest_per_student[sub.student_id] = sub
                    scored_subs = list(latest_per_student.values())
                else:
                    scored_subs = item_subs

                avg_score = (
                    round(
                        sum(float(sub.score_percentage) for sub in scored_subs) / len(scored_subs),
                        2,
                    )
                    if scored_subs
                    else 0.0
                )
                standalone_lists_out.append(
                    StandaloneListAnalyticsOut(
                        list_id=item.id,
                        title=item.title,
                        submissions_count=len(item_subs),
                        distinct_students_count=len(distinct_students),
                        average_score_percentage=avg_score,
                    )
                )
            standalone_lists_out.sort(key=lambda row: (-row.submissions_count, row.title.lower()))

    return TeacherTopicAnalyticsOut(
        kpis=TeacherKpisOut(
            total_organizations=total_organizations,
            total_classrooms=len(scoped_classroom_ids),
            total_students=total_students,
            total_published_lists=total_published_lists,
            total_standalone_lists=total_standalone_lists,
            total_submissions=total_submissions,
            overall_accuracy_percentage=overall_accuracy,
            pending_retake_requests=pending_retake_requests,
        ),
        topics=topics,
        lowest_performing_topics=lowest_performing,
        highest_performing_topics=highest_performing,
        standalone_lists=standalone_lists_out,
    )


def list_teacher_students(
    db: Session,
    teacher_id: UUID,
    organization_id: UUID | None = None,
    classroom_id: UUID | None = None,
    list_id: UUID | None = None,
    list_type: AnalyticsListType = "all",
) -> list[TeacherStudentSummaryOut]:
    """List students enrolled in teacher classrooms or participating in teacher standalone lists."""
    _, qlist = _validate_analytics_scope(
        db, teacher_id, organization_id, classroom_id, list_id
    )

    students_map: dict[UUID, User] = {}
    classrooms_by_student: dict[UUID, list[ClassroomRefOut]] = defaultdict(list)

    include_classroom_students = list_type != "standalone" and (
        qlist is None or not qlist.is_standalone
    )
    if include_classroom_students:
        target_classroom_id = classroom_id
        if target_classroom_id is None and qlist is not None and not qlist.is_standalone:
            target_classroom_id = qlist.classroom_id

        enrollment_stmt = (
            select(User, Classroom, Organization.name.label("organization_name"))
            .join(ClassroomEnrollment, ClassroomEnrollment.student_id == User.id)
            .join(Classroom, Classroom.id == ClassroomEnrollment.classroom_id)
            .outerjoin(Organization, Organization.id == Classroom.organization_id)
            .where(Classroom.teacher_id == teacher_id, User.role == "student")
            .order_by(User.name.asc(), Classroom.name.asc())
        )
        if organization_id is not None:
            enrollment_stmt = enrollment_stmt.where(Classroom.organization_id == organization_id)
        if target_classroom_id is not None:
            enrollment_stmt = enrollment_stmt.where(Classroom.id == target_classroom_id)

        for student, classroom_obj, org_name in db.execute(enrollment_stmt).all():
            students_map[student.id] = student
            vis: VisibilityType = classroom_obj.visibility  # type: ignore[assignment]
            classrooms_by_student[student.id].append(
                ClassroomRefOut(
                    id=classroom_obj.id,
                    name=classroom_obj.name,
                    organization_id=classroom_obj.organization_id,
                    organization_name=org_name,
                    visibility=vis,
                )
            )

    include_standalone_students = (
        list_type in ("all", "standalone")
        and organization_id is None
        and classroom_id is None
        and (qlist is None or qlist.is_standalone)
    )
    if include_standalone_students:
        standalone_stmt = (
            select(User)
            .join(Submission, Submission.student_id == User.id)
            .join(QuestionList, QuestionList.id == Submission.question_list_id)
            .where(
                QuestionList.teacher_id == teacher_id,
                QuestionList.is_standalone.is_(True),
                User.role == "student",
            )
            .distinct()
        )
        if list_id is not None:
            standalone_stmt = standalone_stmt.where(QuestionList.id == list_id)
        for student in db.scalars(standalone_stmt).all():
            students_map.setdefault(student.id, student)

    if not students_map:
        return []

    student_ids = list(students_map.keys())

    sub_stmt = _apply_list_filters(
        select(Submission)
        .join(QuestionList, QuestionList.id == Submission.question_list_id)
        .outerjoin(Classroom, Classroom.id == QuestionList.classroom_id)
        .options(joinedload(Submission.question_list))
        .where(Submission.student_id.in_(student_ids))
        .order_by(Submission.attempt_number.desc()),
        teacher_id,
        organization_id,
        classroom_id,
        list_id,
        list_type,
    )
    submissions = db.scalars(sub_stmt).unique().all()
    subs_by_student: dict[UUID, list[Submission]] = defaultdict(list)
    for sub in submissions:
        subs_by_student[sub.student_id].append(sub)

    pending_stmt = _apply_list_filters(
        select(RetakeAuthorization.student_id)
        .join(QuestionList, QuestionList.id == RetakeAuthorization.question_list_id)
        .outerjoin(Classroom, Classroom.id == QuestionList.classroom_id)
        .where(
            RetakeAuthorization.student_id.in_(student_ids),
            RetakeAuthorization.status == "pending",
        ),
        teacher_id,
        organization_id,
        classroom_id,
        list_id,
        list_type,
    )
    pending_student_ids = set(db.scalars(pending_stmt).all())

    results: list[TeacherStudentSummaryOut] = []
    ordered_students = sorted(students_map.values(), key=lambda s: s.name.lower())
    for student in ordered_students:
        student_subs = subs_by_student[student.id]
        latest_by_list: dict[UUID, Submission] = {}
        last_submitted_at: datetime | None = None
        standalone_submissions_count = 0

        for sub in student_subs:
            if sub.question_list.is_standalone:
                standalone_submissions_count += 1
            existing = latest_by_list.get(sub.question_list_id)
            if existing is None or sub.attempt_number > existing.attempt_number:
                latest_by_list[sub.question_list_id] = sub
            if last_submitted_at is None or sub.submitted_at > last_submitted_at:
                last_submitted_at = sub.submitted_at

        avg_score: float | None = None
        if latest_by_list:
            avg_score = round(
                sum(float(sub.score_percentage) for sub in latest_by_list.values())
                / len(latest_by_list),
                2,
            )

        results.append(
            TeacherStudentSummaryOut(
                student_id=student.id,
                name=student.name,
                email=student.email,
                classrooms=classrooms_by_student[student.id],
                lists_completed_count=len(latest_by_list),
                total_attempts_count=len(student_subs),
                standalone_submissions_count=standalone_submissions_count,
                average_score_percentage=avg_score,
                last_submitted_at=last_submitted_at,
                has_pending_retake=student.id in pending_student_ids,
            )
        )

    return results


def get_teacher_student_detail(
    db: Session,
    teacher_id: UUID,
    student_id: UUID,
    organization_id: UUID | None = None,
    classroom_id: UUID | None = None,
    list_id: UUID | None = None,
    list_type: AnalyticsListType = "all",
) -> TeacherStudentDetailOut:
    """Build an individual student's detailed performance report scoped to a teacher."""
    _, qlist = _validate_analytics_scope(
        db, teacher_id, organization_id, classroom_id, list_id
    )

    student = db.get(User, student_id)
    if student is None or student.role != "student":
        raise APIError(status_code=404, detail="Aluno não encontrado.", code="STUDENT_NOT_FOUND")

    enrolled_classrooms: list[Classroom] = []
    if list_type != "standalone" and (qlist is None or not qlist.is_standalone):
        classroom_stmt = (
            select(Classroom)
            .join(ClassroomEnrollment, ClassroomEnrollment.classroom_id == Classroom.id)
            .options(joinedload(Classroom.organization))
            .where(
                Classroom.teacher_id == teacher_id,
                ClassroomEnrollment.student_id == student_id,
            )
            .order_by(Classroom.name.asc())
        )
        if organization_id is not None:
            classroom_stmt = classroom_stmt.where(Classroom.organization_id == organization_id)
        if classroom_id is not None:
            classroom_stmt = classroom_stmt.where(Classroom.id == classroom_id)
        elif qlist is not None and not qlist.is_standalone:
            classroom_stmt = classroom_stmt.where(Classroom.id == qlist.classroom_id)
        enrolled_classrooms = list(db.scalars(classroom_stmt).all())

    sub_stmt = _apply_list_filters(
        select(Submission)
        .join(QuestionList, QuestionList.id == Submission.question_list_id)
        .outerjoin(Classroom, Classroom.id == QuestionList.classroom_id)
        .options(
            joinedload(Submission.question_list)
            .joinedload(QuestionList.classroom)
            .joinedload(Classroom.organization),
            joinedload(Submission.answers)
            .joinedload(SubmissionAnswer.question)
            .joinedload(Question.topic),
        )
        .where(Submission.student_id == student_id)
        .order_by(Submission.submitted_at.desc(), Submission.attempt_number.desc()),
        teacher_id,
        organization_id,
        classroom_id,
        list_id,
        list_type,
    )

    submissions = db.scalars(sub_stmt).unique().all()

    if not enrolled_classrooms and not submissions:
        raise APIError(
            status_code=404,
            detail="Aluno não possui vínculo ou submissões nos critérios selecionados.",
            code="STUDENT_NOT_ENROLLED",
        )

    latest_by_list: dict[UUID, Submission] = {}
    attempts_count_by_list: dict[UUID, int] = defaultdict(int)
    standalone_submissions_count = 0
    for sub in submissions:
        if sub.question_list.is_standalone:
            standalone_submissions_count += 1
        attempts_count_by_list[sub.question_list_id] += 1
        existing = latest_by_list.get(sub.question_list_id)
        if existing is None or sub.attempt_number > existing.attempt_number:
            latest_by_list[sub.question_list_id] = sub

    topic_inputs: list[tuple[UUID, str, bool]] = []
    for sub in latest_by_list.values():
        for ans in sub.answers:
            topic_inputs.append((ans.question.topic.id, ans.question.topic.name, ans.is_correct))

    topic_performance = build_topic_metrics(topic_inputs)
    weakest_topic = topic_performance[0].topic_name if topic_performance else None
    strongest_topic = (
        max(
            topic_performance,
            key=lambda item: (item.accuracy_percentage, item.total_answers, item.topic_name),
        ).topic_name
        if topic_performance
        else None
    )

    avg_score: float | None = (
        round(
            sum(float(sub.score_percentage) for sub in latest_by_list.values())
            / len(latest_by_list),
            2,
        )
        if latest_by_list
        else None
    )

    list_ids = list({sub.question_list_id for sub in submissions})
    retakes_by_list: dict[UUID, list[RetakeAuthorization]] = defaultdict(list)
    if list_ids:
        retakes = db.scalars(
            select(RetakeAuthorization).where(
                RetakeAuthorization.student_id == student_id,
                RetakeAuthorization.question_list_id.in_(list_ids),
            )
        ).all()
        for retake in retakes:
            retakes_by_list[retake.question_list_id].append(retake)

    submission_items: list[TeacherStudentSubmissionItemOut] = []
    for sub in submissions:
        qlist_obj = sub.question_list
        hierarchy = extract_list_hierarchy_meta(qlist_obj)
        retake_status, pending_id = resolve_retake_state(retakes_by_list[qlist_obj.id])
        submission_items.append(
            TeacherStudentSubmissionItemOut(
                submission_id=sub.id,
                question_list_id=qlist_obj.id,
                question_list_title=qlist_obj.title,
                classroom_id=hierarchy["classroom_id"],
                classroom_name=hierarchy["classroom_name"],
                organization_id=hierarchy["organization_id"],
                organization_name=hierarchy["organization_name"],
                is_standalone=hierarchy["is_standalone"],
                attempt_number=sub.attempt_number,
                attempts_on_list=attempts_count_by_list[qlist_obj.id],
                correct_count=sub.correct_count,
                total_questions=sub.total_questions,
                score_percentage=float(sub.score_percentage),
                teacher_comment=sub.teacher_comment,
                retake_status=retake_status,
                pending_retake_request_id=pending_id,
                can_authorize_retake=retake_status != "approved",
                submitted_at=sub.submitted_at,
            )
        )

    return TeacherStudentDetailOut(
        student=TeacherStudentInfoOut(
            id=student.id,
            name=student.name,
            email=student.email,
            classrooms=[
                ClassroomRefOut(
                    id=c.id,
                    name=c.name,
                    organization_id=c.organization_id,
                    organization_name=c.organization.name if c.organization else None,
                    visibility=c.visibility,  # type: ignore[arg-type]
                )
                for c in enrolled_classrooms
            ],
        ),
        summary=TeacherStudentProfileSummaryOut(
            average_score_percentage=avg_score,
            lists_completed_count=len(latest_by_list),
            total_attempts_count=len(submissions),
            standalone_submissions_count=standalone_submissions_count,
            strongest_topic=strongest_topic,
            weakest_topic=weakest_topic,
        ),
        topic_performance=topic_performance,
        submissions=submission_items,
    )
