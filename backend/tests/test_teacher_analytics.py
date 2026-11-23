from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.seed import seed_database
from app.models.classroom import Classroom, ClassroomEnrollment
from app.models.question_list import Question, QuestionList
from app.models.submission import RetakeAuthorization, Submission
from app.models.topic import Topic
from app.models.user import User
from tests.conftest import (
    create_classroom,
    create_list_with_questions,
    create_topic,
    register_and_login,
)


def test_teacher_analytics_scope_latest_vs_all_and_student_profile(client: TestClient) -> None:
    t1 = register_and_login(client, name="Prof Ana", email="ana@synapta.edu", role="teacher")
    t2 = register_and_login(client, name="Prof Carlos", email="carlos@synapta.edu", role="teacher")
    s1 = register_and_login(client, name="Lucas", email="lucas@synapta.edu", role="student")
    s2 = register_and_login(client, name="Mariana", email="mariana@synapta.edu", role="student")

    topic_frac = create_topic(client, t1["headers"], "Frações")
    topic_geom = create_topic(client, t1["headers"], "Geometria")
    topic_alg = create_topic(client, t1["headers"], "Álgebra")

    c1 = create_classroom(client, t1["headers"], "Turma Ana")
    c2 = create_classroom(client, t2["headers"], "Turma Carlos")

    list1 = create_list_with_questions(
        client,
        t1["headers"],
        classroom_id=c1["id"],
        title="Lista Ana 1",
        questions_spec=[
            {
                "topic_id": topic_frac["id"],
                "statement": "Q Frações",
                "options": {"A": "1", "B": "2", "C": "3", "D": "4"},
                "correct_option": "A",
                "explanation": "A é correta.",
            },
            {
                "topic_id": topic_geom["id"],
                "statement": "Q Geometria",
                "options": {"A": "1", "B": "2", "C": "3", "D": "4"},
                "correct_option": "B",
                "explanation": "B é correta.",
            },
            {
                "topic_id": topic_alg["id"],
                "statement": "Q Álgebra",
                "options": {"A": "1", "B": "2", "C": "3", "D": "4"},
                "correct_option": "C",
                "explanation": "C é correta.",
            },
        ],
        publish=True,
    )
    q1_ids = [q["id"] for q in list1["questions"]]

    # Other teacher list to verify teacher isolation
    list_carlos = create_list_with_questions(
        client,
        t2["headers"],
        classroom_id=c2["id"],
        title="Lista Carlos",
        questions_spec=[
            {
                "topic_id": topic_frac["id"],
                "statement": "Q Carlos",
                "options": {"A": "1", "B": "2", "C": "3", "D": "4"},
                "correct_option": "D",
                "explanation": "D é correta.",
            }
        ],
        publish=True,
    )

    client.post(f"/api/v1/student/classrooms/{c1['id']}/enroll", headers=s1["headers"])
    client.post(f"/api/v1/student/classrooms/{c1['id']}/enroll", headers=s2["headers"])
    client.post(f"/api/v1/student/classrooms/{c2['id']}/enroll", headers=s1["headers"])

    # s1 submits list_carlos (should not affect t1 analytics)
    client.post(
        f"/api/v1/student/lists/{list_carlos['id']}/submit",
        headers=s1["headers"],
        json={"answers": [{"question_id": list_carlos["questions"][0]["id"], "selected_option": "A"}]},
    )

    # s1 attempt 1 on list1: 0/3 (all wrong)
    client.post(
        f"/api/v1/student/lists/{list1['id']}/submit",
        headers=s1["headers"],
        json={
            "answers": [
                {"question_id": q1_ids[0], "selected_option": "D"},
                {"question_id": q1_ids[1], "selected_option": "D"},
                {"question_id": q1_ids[2], "selected_option": "D"},
            ]
        },
    )
    # Teacher proactively unlocks retake for s1 -> s1 attempt 2: Frações wrong, Geometria right, Álgebra right (66.67%)
    client.post(
        f"/api/v1/teacher/lists/{list1['id']}/students/{s1['user_id']}/authorize-retake",
        headers=t1["headers"],
        json={},
    )
    client.post(
        f"/api/v1/student/lists/{list1['id']}/submit",
        headers=s1["headers"],
        json={
            "answers": [
                {"question_id": q1_ids[0], "selected_option": "D"},  # Frações wrong
                {"question_id": q1_ids[1], "selected_option": "B"},  # Geometria right
                {"question_id": q1_ids[2], "selected_option": "C"},  # Álgebra right
            ]
        },
    )

    # s2 attempt 1: Frações wrong, Geometria wrong, Álgebra right (33.33%)
    client.post(
        f"/api/v1/student/lists/{list1['id']}/submit",
        headers=s2["headers"],
        json={
            "answers": [
                {"question_id": q1_ids[0], "selected_option": "D"},  # Frações wrong
                {"question_id": q1_ids[1], "selected_option": "D"},  # Geometria wrong
                {"question_id": q1_ids[2], "selected_option": "C"},  # Álgebra right
            ]
        },
    )

    # Pending retake request from s2 to verify KPI pending_retake_requests
    client.post(
        f"/api/v1/student/lists/{list1['id']}/retake-request",
        headers=s2["headers"],
        json={"reason": "Quero tentar de novo"},
    )

    # scope=latest: s1 attempt 2 + s2 attempt 1
    # Frações: 0/2 = 0.0%, Geometria: 1/2 = 50.0%, Álgebra: 2/2 = 100.0%, Overall: 3/6 = 50.0%
    latest_resp = client.get("/api/v1/teacher/analytics/topics", headers=t1["headers"])
    assert latest_resp.status_code == 200
    latest = latest_resp.json()
    assert latest["kpis"] == {
        "total_classrooms": 1,
        "total_students": 2,
        "total_published_lists": 1,
        "total_submissions": 3,
        "overall_accuracy_percentage": 50.0,
        "pending_retake_requests": 1,
    }
    assert [t["topic_name"] for t in latest["topics"]] == ["Frações", "Geometria", "Álgebra"]
    assert [t["accuracy_percentage"] for t in latest["topics"]] == [0.0, 50.0, 100.0]
    assert latest["lowest_performing_topics"][0]["topic_name"] == "Frações"
    assert latest["highest_performing_topics"][0]["topic_name"] == "Álgebra"

    # scope=all: includes s1 attempt 1 (all 3 wrong) + s1 attempt 2 + s2 attempt 1 -> 9 answers, 3 correct = 33.33%
    all_resp = client.get("/api/v1/teacher/analytics/topics?scope=all", headers=t1["headers"])
    assert all_resp.status_code == 200
    all_data = all_resp.json()
    assert all_data["kpis"]["overall_accuracy_percentage"] == 33.33
    assert all_data["topics"][2]["topic_name"] == "Álgebra"
    assert all_data["topics"][2]["accuracy_percentage"] == 66.67

    # Cross-teacher filter forbidden
    assert (
        client.get(
            f"/api/v1/teacher/analytics/topics?classroom_id={c2['id']}", headers=t1["headers"]
        ).status_code
        == 403
    )

    # Teacher students summary
    students = client.get("/api/v1/teacher/students", headers=t1["headers"]).json()
    assert len(students) == 2
    by_id = {row["student_id"]: row for row in students}
    s1_row = by_id[str(s1["user_id"])]
    assert s1_row["lists_completed_count"] == 1
    assert s1_row["total_attempts_count"] == 2
    assert s1_row["average_score_percentage"] == 66.67
    assert s1_row["has_pending_retake"] is False
    # Only t1's classroom shown, not t2's classroom
    assert [c["id"] for c in s1_row["classrooms"]] == [c1["id"]]

    s2_row = by_id[str(s2["user_id"])]
    assert s2_row["has_pending_retake"] is True
    assert s2_row["average_score_percentage"] == 33.33

    # Individual student detail for s1 (t1 view)
    s1_detail = client.get(
        f"/api/v1/teacher/students/{s1['user_id']}", headers=t1["headers"]
    ).json()
    assert s1_detail["summary"]["average_score_percentage"] == 66.67
    assert s1_detail["summary"]["lists_completed_count"] == 1
    assert s1_detail["summary"]["total_attempts_count"] == 2
    assert s1_detail["summary"]["weakest_topic"] == "Frações"
    assert s1_detail["summary"]["strongest_topic"] in {"Álgebra", "Geometria"}
    assert len(s1_detail["submissions"]) == 2
    assert s1_detail["submissions"][0]["attempt_number"] == 2
    assert s1_detail["submissions"][0]["retake_status"] == "none"
    assert s1_detail["submissions"][0]["can_authorize_retake"] is True

    # Student not enrolled with t2 -> 404 when t2 asks for s2's profile
    assert (
        client.get(
            f"/api/v1/teacher/students/{s2['user_id']}", headers=t2["headers"]
        ).status_code
        == 404
    )

    # Filter analytics by classroom_id and list_id
    filtered = client.get(
        f"/api/v1/teacher/analytics/topics?classroom_id={c1['id']}&list_id={list1['id']}",
        headers=t1["headers"],
    )
    assert filtered.status_code == 200
    assert filtered.json()["kpis"]["total_submissions"] == 3

    # Enrolled student with zero submissions returns average_score_percentage = None
    s3 = register_and_login(client, name="Pedro Sem Entrega", email="pedro0@synapta.edu", role="student")
    client.post(f"/api/v1/student/classrooms/{c1['id']}/enroll", headers=s3["headers"])
    students_after = client.get("/api/v1/teacher/students", headers=t1["headers"]).json()
    s3_summary = next(row for row in students_after if row["student_id"] == str(s3["user_id"]))
    assert s3_summary["lists_completed_count"] == 0
    assert s3_summary["total_attempts_count"] == 0
    assert s3_summary["average_score_percentage"] is None

    s3_detail = client.get(
        f"/api/v1/teacher/students/{s3['user_id']}", headers=t1["headers"]
    ).json()
    assert s3_detail["summary"]["average_score_percentage"] is None
    assert s3_detail["summary"]["strongest_topic"] is None
    assert s3_detail["summary"]["weakest_topic"] is None


def test_seed_database_is_idempotent(db_session: Session) -> None:
    seed_database(db_session)
    seed_database(db_session)

    assert db_session.scalar(select(func.count(User.id))) == 7
    assert db_session.scalar(select(func.count(Topic.id))) == 6
    assert db_session.scalar(select(func.count(Classroom.id))) == 3
    assert db_session.scalar(select(func.count(ClassroomEnrollment.id))) == 8
    assert db_session.scalar(select(func.count(QuestionList.id))) == 5
    assert db_session.scalar(select(func.count(Question.id))) == 24
    assert db_session.scalar(select(func.count(Submission.id))) == 12
    assert db_session.scalar(select(func.count(RetakeAuthorization.id))) == 4
