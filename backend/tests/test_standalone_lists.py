from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from tests.conftest import (
    create_classroom,
    create_list_with_questions,
    create_topic,
    register_and_login,
)


def _sample_question(topic_id: str, statement: str, correct: str = "B") -> dict:
    return {
        "topic_id": topic_id,
        "statement": statement,
        "options": {"A": "A1", "B": "B2", "C": "C3", "D": "D4"},
        "correct_option": correct,
        "explanation": "Explicação padrão.",
    }


def test_standalone_list_validation_classification_lock_and_student_access(
    client: TestClient,
) -> None:
    teacher = register_and_login(client, name="Prof Ana", email="ana@synapta.edu", role="teacher")
    student_free = register_and_login(
        client, name="Aluno Livre", email="livre@synapta.edu", role="student"
    )

    topic_bio = create_topic(client, teacher["headers"], "Genética")
    topic_hist = create_topic(client, teacher["headers"], "História Contemporânea")
    classroom = create_classroom(client, teacher["headers"], "Turma Regular")

    # Standalone cannot have classroom_id or private visibility -> 422
    assert (
        client.post(
            "/api/v1/teacher/lists",
            headers=teacher["headers"],
            json={
                "is_standalone": True,
                "classroom_id": classroom["id"],
                "title": "Inválida",
            },
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/teacher/lists",
            headers=teacher["headers"],
            json={
                "is_standalone": True,
                "visibility": "private",
                "access_code": "ABCD",
                "title": "Inválida Privada",
            },
        ).status_code
        == 422
    )

    # Create draft classroom list, convert to standalone before submissions -> 200
    convertible = create_list_with_questions(
        client,
        teacher["headers"],
        classroom_id=classroom["id"],
        title="Lista Convertível",
        questions_spec=[_sample_question(topic_bio["id"], "Questão convertível 1")],
        publish=False,
    )
    converted = client.patch(
        f"/api/v1/teacher/lists/{convertible['id']}",
        headers=teacher["headers"],
        json={"is_standalone": True, "classroom_id": None},
    )
    assert converted.status_code == 200
    assert converted.json()["is_standalone"] is True
    assert converted.json()["classroom_id"] is None

    # Create and publish standalone list
    standalone = create_list_with_questions(
        client,
        teacher["headers"],
        is_standalone=True,
        title="Simulado Avulso Nacional",
        questions_spec=[
            _sample_question(topic_bio["id"], "Questão de Genética", "B"),
            _sample_question(topic_hist["id"], "Questão de História", "D"),
        ],
        publish=True,
    )
    assert standalone["is_standalone"] is True
    assert standalone["classroom_id"] is None
    assert standalone["visibility"] == "public"

    # Teacher lists filter by list_type
    standalone_teacher_lists = client.get(
        "/api/v1/teacher/lists?list_type=standalone", headers=teacher["headers"]
    ).json()
    assert {item["id"] for item in standalone_teacher_lists} == {
        convertible["id"],
        standalone["id"],
    }

    # Unenrolled student sees standalone list in scope=all and scope=standalone, NOT in scope=classroom
    assert [
        item["id"]
        for item in client.get("/api/v1/student/lists", headers=student_free["headers"]).json()
    ] == [standalone["id"]]
    assert [
        item["id"]
        for item in client.get(
            "/api/v1/student/lists?scope=standalone", headers=student_free["headers"]
        ).json()
    ] == [standalone["id"]]
    assert (
        client.get(
            "/api/v1/student/lists?scope=classroom", headers=student_free["headers"]
        ).json()
        == []
    )

    # Unenrolled student fetches detail without answer keys
    detail = client.get(
        f"/api/v1/student/lists/{standalone['id']}", headers=student_free["headers"]
    )
    assert detail.status_code == 200
    d_json = detail.json()
    assert d_json["is_standalone"] is True
    assert d_json["is_unlocked"] is True
    assert d_json["classroom_id"] is None
    assert "correct_option" not in d_json["questions"][0]

    # Submit attempt #1 (1/2 = 50%)
    q_ids = [q["id"] for q in standalone["questions"]]
    sub1 = client.post(
        f"/api/v1/student/lists/{standalone['id']}/submit",
        headers=student_free["headers"],
        json={
            "answers": [
                {"question_id": q_ids[0], "selected_option": "B"},
                {"question_id": q_ids[1], "selected_option": "A"},
            ]
        },
    )
    assert sub1.status_code == 201
    fb1 = sub1.json()
    assert fb1["is_standalone"] is True
    assert fb1["classroom_id"] is None
    assert fb1["organization_id"] is None
    assert fb1["score_percentage"] == 50.0
    assert fb1["can_attempt"] is False

    # After submission, teacher CANNOT switch classification to classroom -> 409 LIST_HAS_SUBMISSIONS
    reclassify = client.patch(
        f"/api/v1/teacher/lists/{standalone['id']}",
        headers=teacher["headers"],
        json={"is_standalone": False, "classroom_id": classroom["id"]},
    )
    assert reclassify.status_code == 409
    assert reclassify.json()["code"] == "LIST_HAS_SUBMISSIONS"

    # Retakes on standalone lists obey the exact same rules
    assert (
        client.post(
            f"/api/v1/student/lists/{standalone['id']}/submit",
            headers=student_free["headers"],
            json={
                "answers": [
                    {"question_id": q_ids[0], "selected_option": "B"},
                    {"question_id": q_ids[1], "selected_option": "D"},
                ]
            },
        ).status_code
        == 403
    )

    req_retake = client.post(
        f"/api/v1/student/lists/{standalone['id']}/retake-request",
        headers=student_free["headers"],
        json={"reason": "Quero melhorar no simulado avulso."},
    )
    assert req_retake.status_code == 201
    assert req_retake.json()["is_standalone"] is True
    assert req_retake.json()["classroom_id"] is None

    pending = client.get(
        "/api/v1/teacher/retake-requests?status=pending", headers=teacher["headers"]
    ).json()
    assert len(pending) == 1
    assert pending[0]["is_standalone"] is True

    approve = client.post(
        f"/api/v1/teacher/retake-requests/{req_retake.json()['id']}/decide",
        headers=teacher["headers"],
        json={"decision": "approved"},
    )
    assert approve.status_code == 200

    sub2 = client.post(
        f"/api/v1/student/lists/{standalone['id']}/submit",
        headers=student_free["headers"],
        json={
            "answers": [
                {"question_id": q_ids[0], "selected_option": "B"},
                {"question_id": q_ids[1], "selected_option": "D"},
            ]
        },
    )
    assert sub2.status_code == 201
    assert sub2.json()["attempt_number"] == 2
    assert sub2.json()["score_percentage"] == 100.0

    # Student history includes standalone list metadata
    hist = client.get("/api/v1/student/submissions", headers=student_free["headers"]).json()
    assert len(hist) == 2
    assert all(item["is_standalone"] is True and item["classroom_id"] is None for item in hist)


def test_concurrent_standalone_first_submissions_serialize_cleanly(client: TestClient) -> None:
    teacher = register_and_login(client, name="Prof Ana", email="ana@synapta.edu", role="teacher")
    student = register_and_login(client, name="Aluno", email="aluno@synapta.edu", role="student")
    topic = create_topic(client, teacher["headers"], "Interpretação de Texto")

    standalone = create_list_with_questions(
        client,
        teacher["headers"],
        is_standalone=True,
        title="Simulado Avulso Concorrente",
        questions_spec=[_sample_question(topic["id"], "Q Texto", "B")],
        publish=True,
    )
    q_id = standalone["questions"][0]["id"]
    payload = {"answers": [{"question_id": q_id, "selected_option": "B"}]}

    def _submit() -> int:
        resp = client.post(
            f"/api/v1/student/lists/{standalone['id']}/submit",
            headers=student["headers"],
            json=payload,
        )
        return resp.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(list(pool.map(lambda _: _submit(), range(2))))

    assert statuses == [201, 403]
