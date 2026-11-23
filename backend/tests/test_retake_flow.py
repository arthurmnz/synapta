from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from tests.conftest import (
    create_classroom,
    create_list_with_questions,
    create_topic,
    register_and_login,
)


def _setup_student_submitted_list(client: TestClient) -> tuple[dict, dict, dict, dict]:
    teacher = register_and_login(client, name="Prof Ana", email="ana@synapta.edu", role="teacher")
    student = register_and_login(client, name="Aluno Lucas", email="lucas@synapta.edu", role="student")
    topic = create_topic(client, teacher["headers"], "Porcentagem")
    classroom = create_classroom(client, teacher["headers"], "Turma Retake")

    qlist = create_list_with_questions(
        client,
        teacher["headers"],
        classroom_id=classroom["id"],
        title="Lista com Retentativas",
        questions_spec=[
            {
                "topic_id": topic["id"],
                "statement": "10% de 200 = ?",
                "options": {"A": "10", "B": "20", "C": "30", "D": "40"},
                "correct_option": "B",
                "explanation": "0.10 * 200 = 20.",
            },
            {
                "topic_id": topic["id"],
                "statement": "50% de 80 = ?",
                "options": {"A": "40", "B": "20", "C": "60", "D": "10"},
                "correct_option": "A",
                "explanation": "Metade de 80 é 40.",
            },
        ],
        publish=True,
    )
    client.post(f"/api/v1/student/classrooms/{classroom['id']}/enroll", headers=student["headers"])
    return teacher, student, classroom, qlist


def test_student_request_teacher_approval_and_consumption(client: TestClient) -> None:
    teacher, student, _, qlist = _setup_student_submitted_list(client)
    q_ids = [q["id"] for q in qlist["questions"]]

    # Cannot request retake before first submission -> 400
    early_req = client.post(
        f"/api/v1/student/lists/{qlist['id']}/retake-request",
        headers=student["headers"],
        json={"reason": "Quero tentar antes"},
    )
    assert early_req.status_code == 400

    # Attempt #1: 0/2 = 0% ("critical")
    sub1 = client.post(
        f"/api/v1/student/lists/{qlist['id']}/submit",
        headers=student["headers"],
        json={
            "answers": [
                {"question_id": q_ids[0], "selected_option": "A"},
                {"question_id": q_ids[1], "selected_option": "D"},
            ]
        },
    )
    assert sub1.status_code == 201
    assert sub1.json()["score_percentage"] == 0.0
    assert sub1.json()["performance_band"] == "critical"

    # Request retake -> 201 pending
    req_resp = client.post(
        f"/api/v1/student/lists/{qlist['id']}/retake-request",
        headers=student["headers"],
        json={"reason": "Revisei a matéria e quero refazer."},
    )
    assert req_resp.status_code == 201
    req_data = req_resp.json()
    assert req_data["status"] == "pending"
    assert req_data["attempts_used"] == 1
    assert req_data["last_score_percentage"] == 0.0

    # Duplicate request while pending -> 409
    assert (
        client.post(
            f"/api/v1/student/lists/{qlist['id']}/retake-request",
            headers=student["headers"],
            json={},
        ).status_code
        == 409
    )

    # Teacher sees pending request and approves
    pending_list = client.get(
        "/api/v1/teacher/retake-requests?status=pending", headers=teacher["headers"]
    ).json()
    assert len(pending_list) == 1
    assert pending_list[0]["id"] == req_data["id"]

    decide_resp = client.post(
        f"/api/v1/teacher/retake-requests/{req_data['id']}/decide",
        headers=teacher["headers"],
        json={"decision": "approved"},
    )
    assert decide_resp.status_code == 200
    assert decide_resp.json()["status"] == "approved"

    # Cannot decide again -> 409
    assert (
        client.post(
            f"/api/v1/teacher/retake-requests/{req_data['id']}/decide",
            headers=teacher["headers"],
            json={"decision": "rejected"},
        ).status_code
        == 409
    )

    # Student list summary reflects approved retake
    s_lists = client.get("/api/v1/student/lists", headers=student["headers"]).json()
    assert s_lists[0]["attempts_used"] == 1
    assert s_lists[0]["max_attempts_available_now"] == 2
    assert s_lists[0]["can_attempt"] is True
    assert s_lists[0]["retake_status"] == "approved"

    # Attempt #2: 2/2 = 100% ("excellent")
    sub2 = client.post(
        f"/api/v1/student/lists/{qlist['id']}/submit",
        headers=student["headers"],
        json={
            "answers": [
                {"question_id": q_ids[0], "selected_option": "B"},
                {"question_id": q_ids[1], "selected_option": "A"},
            ]
        },
    )
    assert sub2.status_code == 201
    fb2 = sub2.json()
    assert fb2["attempt_number"] == 2
    assert fb2["attempts_used_total"] == 2
    assert fb2["score_percentage"] == 100.0
    assert fb2["performance_band"] == "excellent"
    assert fb2["retake_status"] == "none"
    assert fb2["can_attempt"] is False

    # Attempt #3 blocked without another approval -> 403
    assert (
        client.post(
            f"/api/v1/student/lists/{qlist['id']}/submit",
            headers=student["headers"],
            json={
                "answers": [
                    {"question_id": q_ids[0], "selected_option": "B"},
                    {"question_id": q_ids[1], "selected_option": "A"},
                ]
            },
        ).status_code
        == 403
    )


def test_rejection_and_proactive_teacher_authorization(client: TestClient) -> None:
    teacher, student, _, qlist = _setup_student_submitted_list(client)
    q_ids = [q["id"] for q in qlist["questions"]]

    # Proactive authorization before any submission -> 400
    assert (
        client.post(
            f"/api/v1/teacher/lists/{qlist['id']}/students/{student['user_id']}/authorize-retake",
            headers=teacher["headers"],
            json={},
        ).status_code
        == 400
    )

    # Attempt #1
    client.post(
        f"/api/v1/student/lists/{qlist['id']}/submit",
        headers=student["headers"],
        json={
            "answers": [
                {"question_id": q_ids[0], "selected_option": "B"},
                {"question_id": q_ids[1], "selected_option": "D"},
            ]
        },
    )

    # Request retake and reject
    req = client.post(
        f"/api/v1/student/lists/{qlist['id']}/retake-request",
        headers=student["headers"],
        json={"reason": "Tentativa extra"},
    ).json()
    rej = client.post(
        f"/api/v1/teacher/retake-requests/{req['id']}/decide",
        headers=teacher["headers"],
        json={"decision": "rejected"},
    )
    assert rej.status_code == 200
    assert rej.json()["status"] == "rejected"

    # Student detail reflects rejected status & cannot attempt
    detail = client.get(f"/api/v1/student/lists/{qlist['id']}", headers=student["headers"]).json()
    assert detail["retake_status"] == "rejected"
    assert detail["can_attempt"] is False

    # Teacher proactively authorizes retake (even after rejection) and calling twice is idempotent
    auth1 = client.post(
        f"/api/v1/teacher/lists/{qlist['id']}/students/{student['user_id']}/authorize-retake",
        headers=teacher["headers"],
        json={},
    )
    assert auth1.status_code == 200
    assert auth1.json()["status"] == "approved"

    auth2 = client.post(
        f"/api/v1/teacher/lists/{qlist['id']}/students/{student['user_id']}/authorize-retake",
        headers=teacher["headers"],
        json={},
    )
    assert auth2.status_code == 200
    assert auth2.json()["id"] == auth1.json()["id"]
    assert auth2.json()["status"] == "approved"


def test_concurrent_decide_retake_request_serializes_cleanly(client: TestClient) -> None:
    teacher, student, _, qlist = _setup_student_submitted_list(client)
    q_ids = [q["id"] for q in qlist["questions"]]

    client.post(
        f"/api/v1/student/lists/{qlist['id']}/submit",
        headers=student["headers"],
        json={
            "answers": [
                {"question_id": q_ids[0], "selected_option": "A"},
                {"question_id": q_ids[1], "selected_option": "D"},
            ]
        },
    )
    req = client.post(
        f"/api/v1/student/lists/{qlist['id']}/retake-request",
        headers=student["headers"],
        json={"reason": "Teste de concorrência"},
    ).json()

    def _decide(decision: str) -> tuple[int, dict]:
        resp = client.post(
            f"/api/v1/teacher/retake-requests/{req['id']}/decide",
            headers=teacher["headers"],
            json={"decision": decision},
        )
        return resp.status_code, resp.json()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(_decide, ["approved", "rejected"]))

    statuses = sorted(status for status, _ in results)
    assert statuses == [200, 409]
    conflict_body = next(body for status, body in results if status == 409)
    assert conflict_body["code"] == "RETAKE_ALREADY_DECIDED"


def test_concurrent_authorize_retake_proactively_is_idempotent(client: TestClient) -> None:
    teacher, student, _, qlist = _setup_student_submitted_list(client)
    q_ids = [q["id"] for q in qlist["questions"]]

    client.post(
        f"/api/v1/student/lists/{qlist['id']}/submit",
        headers=student["headers"],
        json={
            "answers": [
                {"question_id": q_ids[0], "selected_option": "A"},
                {"question_id": q_ids[1], "selected_option": "D"},
            ]
        },
    )

    def _authorize(_: int) -> tuple[int, dict]:
        resp = client.post(
            f"/api/v1/teacher/lists/{qlist['id']}/students/{student['user_id']}/authorize-retake",
            headers=teacher["headers"],
            json={},
        )
        return resp.status_code, resp.json()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(_authorize, range(2)))

    assert [status for status, _ in results] == [200, 200]
    ids = {body["id"] for _, body in results}
    assert len(ids) == 1
    assert all(body["status"] == "approved" for _, body in results)
