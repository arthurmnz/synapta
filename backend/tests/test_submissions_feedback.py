from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from tests.conftest import (
    create_classroom,
    create_list_with_questions,
    create_topic,
    register_and_login,
)


def _setup_three_question_list(client: TestClient) -> tuple[dict, dict, dict, dict]:
    teacher = register_and_login(client, name="Prof Ana", email="ana@synapta.edu", role="teacher")
    student = register_and_login(client, name="Aluno Lucas", email="lucas@synapta.edu", role="student")
    t_frac = create_topic(client, teacher["headers"], "Frações")
    t_geom = create_topic(client, teacher["headers"], "Geometria")
    classroom = create_classroom(client, teacher["headers"], "Turma Prova")

    qlist = create_list_with_questions(
        client,
        teacher["headers"],
        classroom_id=classroom["id"],
        title="Simulado 3 Questões",
        questions_spec=[
            {
                "topic_id": t_frac["id"],
                "statement": "1/2 + 1/4 = ?",
                "options": {"A": "1/4", "B": "3/4", "C": "2/6", "D": "1"},
                "correct_option": "B",
                "explanation": "2/4 + 1/4 = 3/4.",
            },
            {
                "topic_id": t_frac["id"],
                "statement": "3/5 de 50 = ?",
                "options": {"A": "30", "B": "20", "C": "25", "D": "15"},
                "correct_option": "A",
                "explanation": "50 / 5 * 3 = 30.",
            },
            {
                "topic_id": t_geom["id"],
                "statement": "Área de quadrado de lado 4 = ?",
                "options": {"A": "8", "B": "12", "C": "16", "D": "20"},
                "correct_option": "C",
                "explanation": "4 * 4 = 16.",
            },
        ],
        publish=True,
    )
    client.post(f"/api/v1/student/classrooms/{classroom['id']}/enroll", headers=student["headers"])
    return teacher, student, classroom, qlist


def test_deterministic_grading_feedback_and_teacher_comment(client: TestClient) -> None:
    teacher, student, _, qlist = _setup_three_question_list(client)
    other_student = register_and_login(
        client, name="Outro Aluno", email="outro@synapta.edu", role="student"
    )
    other_teacher = register_and_login(
        client, name="Outro Prof", email="outrop@synapta.edu", role="teacher"
    )
    q_ids = [q["id"] for q in qlist["questions"]]

    # Missing question -> 422
    assert (
        client.post(
            f"/api/v1/student/lists/{qlist['id']}/submit",
            headers=student["headers"],
            json={"answers": [{"question_id": q_ids[0], "selected_option": "B"}]},
        ).status_code
        == 422
    )

    # Duplicate question -> 422
    assert (
        client.post(
            f"/api/v1/student/lists/{qlist['id']}/submit",
            headers=student["headers"],
            json={
                "answers": [
                    {"question_id": q_ids[0], "selected_option": "B"},
                    {"question_id": q_ids[0], "selected_option": "B"},
                    {"question_id": q_ids[2], "selected_option": "C"},
                ]
            },
        ).status_code
        == 422
    )

    # Valid submission: 2/3 correct = 66.67 ("good")
    submit_resp = client.post(
        f"/api/v1/student/lists/{qlist['id']}/submit",
        headers=student["headers"],
        json={
            "answers": [
                {"question_id": q_ids[0], "selected_option": "B"},  # correct (Frações)
                {"question_id": q_ids[1], "selected_option": "D"},  # wrong (Frações)
                {"question_id": q_ids[2], "selected_option": "C"},  # correct (Geometria)
            ]
        },
    )
    assert submit_resp.status_code == 201
    fb = submit_resp.json()
    assert fb["attempt_number"] == 1
    assert fb["attempts_used_total"] == 1
    assert fb["correct_count"] == 2
    assert fb["total_questions"] == 3
    assert isinstance(fb["score_percentage"], float)
    assert fb["score_percentage"] == 66.67
    assert fb["performance_band"] == "good"
    assert fb["can_attempt"] is False
    assert fb["retake_status"] == "none"

    # Topic breakdown sorted by accuracy ASC: Frações (50.0) then Geometria (100.0)
    assert len(fb["topic_breakdown"]) == 2
    assert fb["topic_breakdown"][0]["topic_name"] == "Frações"
    assert fb["topic_breakdown"][0]["accuracy_percentage"] == 50.0
    assert fb["topic_breakdown"][1]["topic_name"] == "Geometria"
    assert fb["topic_breakdown"][1]["accuracy_percentage"] == 100.0

    # Explanations and correct options now present
    assert fb["questions_feedback"][1]["is_correct"] is False
    assert fb["questions_feedback"][1]["selected_option"] == "D"
    assert fb["questions_feedback"][1]["correct_option"] == "A"
    assert fb["questions_feedback"][1]["explanation"] == "50 / 5 * 3 = 30."

    sub_id = fb["submission_id"]

    # Second submission without retake authorization -> 403
    second_try = client.post(
        f"/api/v1/student/lists/{qlist['id']}/submit",
        headers=student["headers"],
        json={
            "answers": [
                {"question_id": q_ids[0], "selected_option": "B"},
                {"question_id": q_ids[1], "selected_option": "A"},
                {"question_id": q_ids[2], "selected_option": "C"},
            ]
        },
    )
    assert second_try.status_code == 403
    assert second_try.json()["code"] == "RETAKE_AUTHORIZATION_REQUIRED"

    # Cross-user access denied
    assert (
        client.get(
            f"/api/v1/student/submissions/{sub_id}", headers=other_student["headers"]
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/v1/teacher/submissions/{sub_id}", headers=other_teacher["headers"]
        ).status_code
        == 403
    )

    # Teacher adds manual comment
    comment_resp = client.patch(
        f"/api/v1/teacher/submissions/{sub_id}/comment",
        headers=teacher["headers"],
        json={"teacher_comment": "Revise multiplicação de frações!"},
    )
    assert comment_resp.status_code == 200
    assert comment_resp.json()["teacher_comment"] == "Revise multiplicação de frações!"
    assert comment_resp.json()["teacher_commented_at"] is not None

    # Student sees comment in detail and summary
    s_fb = client.get(f"/api/v1/student/submissions/{sub_id}", headers=student["headers"]).json()
    assert s_fb["teacher_comment"] == "Revise multiplicação de frações!"
    s_hist = client.get("/api/v1/student/submissions", headers=student["headers"]).json()
    assert len(s_hist) == 1
    assert s_hist[0]["has_teacher_comment"] is True

    # Teacher clears manual comment
    cleared = client.patch(
        f"/api/v1/teacher/submissions/{sub_id}/comment",
        headers=teacher["headers"],
        json={"teacher_comment": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["teacher_comment"] is None
    assert cleared.json()["teacher_commented_at"] is None


def test_concurrent_first_submissions_serialize_cleanly(client: TestClient) -> None:
    _, student, _, qlist = _setup_three_question_list(client)
    q_ids = [q["id"] for q in qlist["questions"]]
    payload = {
        "answers": [
            {"question_id": q_ids[0], "selected_option": "B"},
            {"question_id": q_ids[1], "selected_option": "A"},
            {"question_id": q_ids[2], "selected_option": "C"},
        ]
    }

    def _submit() -> int:
        resp = client.post(
            f"/api/v1/student/lists/{qlist['id']}/submit",
            headers=student["headers"],
            json=payload,
        )
        return resp.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(list(pool.map(lambda _: _submit(), range(2))))

    assert statuses == [201, 403]
