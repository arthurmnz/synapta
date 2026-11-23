from collections import defaultdict
from datetime import datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import APIError
from app.models.classroom import Classroom, ClassroomEnrollment
from app.models.question_list import Question, QuestionList
from app.models.submission import RetakeAuthorization, Submission, SubmissionAnswer
from app.models.topic import Topic
from app.models.user import User
from app.schemas.analytics import (
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
from app.services.classroom_service import get_owned_classroom
from app.services.submission_service import build_topic_metrics, resolve_retake_state


def get_teacher_topic_analytics(
    db: Session,
    teacher_id: UUID,
    classroom_id: UUID | None = None,
    list_id: UUID | None = None,
    scope: Literal["latest", "all"] = "latest",
) -> TeacherTopicAnalyticsOut:
    """Aggregate KPIs and topic accuracy metrics for a teacher across classrooms/lists."""
    target_classroom_id = classroom_id
    if classroom_id is not None:
        get_owned_classroom(db, classroom_id, teacher_id)

    if list_id is not None:
        qlist = db.get(QuestionList, list_id)
        if qlist is None:
            raise APIError(status_code=404, detail="Lista de questões não encontrada.", code="LIST_NOT_FOUND")
        if qlist.teacher_id != teacher_id:
            raise APIError(
                status_code=403,
                detail="Você não tem permissão para visualizar métricas desta lista.",
                code="FORBIDDEN_LIST",
            )
        if target_classroom_id is None:
            target_classroom_id = qlist.classroom_id

    classroom_stmt = select(Classroom.id).where(Classroom.teacher_id == teacher_id)
    if target_classroom_id is not None:
        classroom_stmt = classroom_stmt.where(Classroom.id == target_classroom_id)
    scoped_classroom_ids = list(db.scalars(classroom_stmt).all())

    if scoped_classroom_ids:
        total_students = int(
            db.scalar(
                select(func.count(func.distinct(ClassroomEnrollment.student_id))).where(
                    ClassroomEnrollment.classroom_id.in_(scoped_classroom_ids)
                )
            )
            or 0
        )
    else:
        total_students = 0

    published_stmt = select(func.count(QuestionList.id)).where(
        QuestionList.teacher_id == teacher_id,
        QuestionList.is_published.is_(True),
    )
    submissions_count_stmt = (
        select(func.count(Submission.id))
        .join(QuestionList, QuestionList.id == Submission.question_list_id)
        .where(QuestionList.teacher_id == teacher_id)
    )
    pending_retake_stmt = (
        select(func.count(RetakeAuthorization.id))
        .join(QuestionList, QuestionList.id == RetakeAuthorization.question_list_id)
        .where(
            QuestionList.teacher_id == teacher_id,
            RetakeAuthorization.status == "pending",
        )
    )

    if classroom_id is not None:
        published_stmt = published_stmt.where(QuestionList.classroom_id == classroom_id)
        submissions_count_stmt = submissions_count_stmt.where(QuestionList.classroom_id == classroom_id)
        pending_retake_stmt = pending_retake_stmt.where(QuestionList.classroom_id == classroom_id)

    if list_id is not None:
        published_stmt = published_stmt.where(QuestionList.id == list_id)
        submissions_count_stmt = submissions_count_stmt.where(QuestionList.id == list_id)
        pending_retake_stmt = pending_retake_stmt.where(QuestionList.id == list_id)

    total_published_lists = int(db.scalar(published_stmt) or 0)
    total_submissions = int(db.scalar(submissions_count_stmt) or 0)
    pending_retake_requests = int(db.scalar(pending_retake_stmt) or 0)

    ranked_subs = (
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
        .where(QuestionList.teacher_id == teacher_id)
    )
    if classroom_id is not None:
        ranked_subs = ranked_subs.where(QuestionList.classroom_id == classroom_id)
    if list_id is not None:
        ranked_subs = ranked_subs.where(QuestionList.id == list_id)

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

    return TeacherTopicAnalyticsOut(
        kpis=TeacherKpisOut(
            total_classrooms=len(scoped_classroom_ids),
            total_students=total_students,
            total_published_lists=total_published_lists,
            total_submissions=total_submissions,
            overall_accuracy_percentage=overall_accuracy,
            pending_retake_requests=pending_retake_requests,
        ),
        topics=topics,
        lowest_performing_topics=lowest_performing,
        highest_performing_topics=highest_performing,
    )


def list_teacher_students(
    db: Session,
    teacher_id: UUID,
    classroom_id: UUID | None = None,
) -> list[TeacherStudentSummaryOut]:
    """List students enrolled in the teacher's classrooms with summary performance stats."""
    if classroom_id is not None:
        get_owned_classroom(db, classroom_id, teacher_id)

    enrollment_stmt = (
        select(User, Classroom)
        .join(ClassroomEnrollment, ClassroomEnrollment.student_id == User.id)
        .join(Classroom, Classroom.id == ClassroomEnrollment.classroom_id)
        .where(Classroom.teacher_id == teacher_id, User.role == "student")
        .order_by(User.name.asc(), Classroom.name.asc())
    )
    if classroom_id is not None:
        enrollment_stmt = enrollment_stmt.where(Classroom.id == classroom_id)

    enrollment_rows = db.execute(enrollment_stmt).all()
    if not enrollment_rows:
        return []

    students_map: dict[UUID, User] = {}
    classrooms_by_student: dict[UUID, list[ClassroomRefOut]] = defaultdict(list)
    for student, classroom in enrollment_rows:
        students_map[student.id] = student
        classrooms_by_student[student.id].append(ClassroomRefOut(id=classroom.id, name=classroom.name))

    student_ids = list(students_map.keys())

    sub_stmt = (
        select(Submission)
        .join(QuestionList, QuestionList.id == Submission.question_list_id)
        .where(
            QuestionList.teacher_id == teacher_id,
            Submission.student_id.in_(student_ids),
        )
        .order_by(Submission.attempt_number.desc())
    )
    if classroom_id is not None:
        sub_stmt = sub_stmt.where(QuestionList.classroom_id == classroom_id)

    submissions = db.scalars(sub_stmt).all()
    subs_by_student: dict[UUID, list[Submission]] = defaultdict(list)
    for sub in submissions:
        subs_by_student[sub.student_id].append(sub)

    pending_stmt = (
        select(RetakeAuthorization.student_id)
        .join(QuestionList, QuestionList.id == RetakeAuthorization.question_list_id)
        .where(
            QuestionList.teacher_id == teacher_id,
            RetakeAuthorization.student_id.in_(student_ids),
            RetakeAuthorization.status == "pending",
        )
    )
    if classroom_id is not None:
        pending_stmt = pending_stmt.where(QuestionList.classroom_id == classroom_id)
    pending_student_ids = set(db.scalars(pending_stmt).all())

    results: list[TeacherStudentSummaryOut] = []
    for student_id, student in students_map.items():
        student_subs = subs_by_student[student_id]
        latest_by_list: dict[UUID, Submission] = {}
        last_submitted_at: datetime | None = None

        for sub in student_subs:
            existing = latest_by_list.get(sub.question_list_id)
            if existing is None or sub.attempt_number > existing.attempt_number:
                latest_by_list[sub.question_list_id] = sub
            if last_submitted_at is None or sub.submitted_at > last_submitted_at:
                last_submitted_at = sub.submitted_at

        avg_score: float | None = None
        if latest_by_list:
            avg_score = round(
                sum(float(sub.score_percentage) for sub in latest_by_list.values()) / len(latest_by_list),
                2,
            )

        results.append(
            TeacherStudentSummaryOut(
                student_id=student.id,
                name=student.name,
                email=student.email,
                classrooms=classrooms_by_student[student_id],
                lists_completed_count=len(latest_by_list),
                total_attempts_count=len(student_subs),
                average_score_percentage=avg_score,
                last_submitted_at=last_submitted_at,
                has_pending_retake=student_id in pending_student_ids,
            )
        )

    return results


def get_teacher_student_detail(
    db: Session,
    teacher_id: UUID,
    student_id: UUID,
    classroom_id: UUID | None = None,
) -> TeacherStudentDetailOut:
    """Build an individual student's detailed performance report scoped to a teacher."""
    if classroom_id is not None:
        get_owned_classroom(db, classroom_id, teacher_id)

    student = db.get(User, student_id)
    if student is None or student.role != "student":
        raise APIError(status_code=404, detail="Aluno não encontrado.", code="STUDENT_NOT_FOUND")

    classroom_stmt = (
        select(Classroom)
        .join(ClassroomEnrollment, ClassroomEnrollment.classroom_id == Classroom.id)
        .where(
            Classroom.teacher_id == teacher_id,
            ClassroomEnrollment.student_id == student_id,
        )
        .order_by(Classroom.name.asc())
    )
    if classroom_id is not None:
        classroom_stmt = classroom_stmt.where(Classroom.id == classroom_id)

    enrolled_classrooms = db.scalars(classroom_stmt).all()
    if not enrolled_classrooms:
        raise APIError(
            status_code=404,
            detail="Aluno não está matriculado em nenhuma turma selecionada.",
            code="STUDENT_NOT_ENROLLED",
        )

    sub_stmt = (
        select(Submission)
        .join(QuestionList, QuestionList.id == Submission.question_list_id)
        .options(
            joinedload(Submission.question_list).joinedload(QuestionList.classroom),
            joinedload(Submission.answers).joinedload(SubmissionAnswer.question).joinedload(Question.topic),
        )
        .where(
            QuestionList.teacher_id == teacher_id,
            Submission.student_id == student_id,
        )
        .order_by(Submission.submitted_at.desc(), Submission.attempt_number.desc())
    )
    if classroom_id is not None:
        sub_stmt = sub_stmt.where(QuestionList.classroom_id == classroom_id)

    submissions = db.scalars(sub_stmt).unique().all()

    latest_by_list: dict[UUID, Submission] = {}
    attempts_count_by_list: dict[UUID, int] = defaultdict(int)
    for sub in submissions:
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
        round(sum(float(sub.score_percentage) for sub in latest_by_list.values()) / len(latest_by_list), 2)
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
        qlist = sub.question_list
        retake_status, pending_id = resolve_retake_state(retakes_by_list[qlist.id])
        submission_items.append(
            TeacherStudentSubmissionItemOut(
                submission_id=sub.id,
                question_list_id=qlist.id,
                question_list_title=qlist.title,
                classroom_id=qlist.classroom.id,
                classroom_name=qlist.classroom.name,
                attempt_number=sub.attempt_number,
                attempts_on_list=attempts_count_by_list[qlist.id],
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
            classrooms=[ClassroomRefOut(id=c.id, name=c.name) for c in enrolled_classrooms],
        ),
        summary=TeacherStudentProfileSummaryOut(
            average_score_percentage=avg_score,
            lists_completed_count=len(latest_by_list),
            total_attempts_count=len(submissions),
            strongest_topic=strongest_topic,
            weakest_topic=weakest_topic,
        ),
        topic_performance=topic_performance,
        submissions=submission_items,
    )
