from fastapi.testclient import TestClient

from tests.conftest import (
    create_classroom,
    create_list_with_questions,
    create_topic,
    register_and_login,
)


def _sample_question(topic_id: str, statement: str = "Quanto é 2 + 2?", correct: str = "B") -> dict:
    return {
        "topic_id": topic_id,
        "statement": statement,
        "options": {"A": "3", "B": "4", "C": "5", "D": "6"},
        "correct_option": correct,
        "explanation": "Somando 2 + 2 obtemos 4.",
    }


def test_teacher_classroom_ownership_and_crud(client: TestClient) -> None:
    t1 = register_and_login(client, name="Prof 1", email="p1@synapta.edu", role="teacher")
    t2 = register_and_login(client, name="Prof 2", email="p2@synapta.edu", role="teacher")

    c1 = create_classroom(client, t1["headers"], "8º Ano A")
    assert c1["student_count"] == 0
    assert c1["list_count"] == 0

    # Teacher 2 cannot see, patch, or delete Teacher 1's classroom
    assert client.get("/api/v1/teacher/classrooms", headers=t2["headers"]).json() == []
    assert (
        client.patch(
            f"/api/v1/teacher/classrooms/{c1['id']}",
            headers=t2["headers"],
            json={"name": "Hack"},
        ).status_code
        == 403
    )
    assert (
        client.delete(f"/api/v1/teacher/classrooms/{c1['id']}", headers=t2["headers"]).status_code == 403
    )

    updated = client.patch(
        f"/api/v1/teacher/classrooms/{c1['id']}",
        headers=t1["headers"],
        json={"name": "8º Ano A - Atualizada", "description": "Nova desc"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "8º Ano A - Atualizada"

    assert (
        client.delete(f"/api/v1/teacher/classrooms/{c1['id']}", headers=t1["headers"]).status_code == 204
    )
    assert client.get("/api/v1/teacher/classrooms", headers=t1["headers"]).json() == []


def test_student_enrollment_and_list_security_hides_answers(client: TestClient) -> None:
    teacher = register_and_login(client, name="Prof Ana", email="ana@synapta.edu", role="teacher")
    student = register_and_login(client, name="Aluno Lucas", email="lucas@synapta.edu", role="student")
    other_student = register_and_login(
        client, name="Aluno Pedro", email="pedro@synapta.edu", role="student"
    )

    topic = create_topic(client, teacher["headers"], "Equações do 1º Grau")
    classroom = create_classroom(client, teacher["headers"], "Turma Matemática")

    # Empty list cannot be published -> 422
    empty_list = client.post(
        "/api/v1/teacher/lists",
        headers=teacher["headers"],
        json={"classroom_id": classroom["id"], "title": "Lista Vazia"},
    ).json()
    assert (
        client.patch(
            f"/api/v1/teacher/lists/{empty_list['id']}",
            headers=teacher["headers"],
            json={"is_published": True},
        ).status_code
        == 422
    )

    # Create draft list + published list
    draft_list = create_list_with_questions(
        client,
        teacher["headers"],
        classroom_id=classroom["id"],
        title="Lista Rascunho",
        questions_spec=[_sample_question(topic["id"])],
        publish=False,
    )
    # Before submission, teacher can delete a question and delete a draft list
    draft_q_id = draft_list["questions"][0]["id"]
    assert client.delete(f"/api/v1/teacher/questions/{draft_q_id}", headers=teacher["headers"]).status_code == 204
    assert client.delete(f"/api/v1/teacher/lists/{draft_list['id']}", headers=teacher["headers"]).status_code == 204

    draft_list = create_list_with_questions(
        client,
        teacher["headers"],
        classroom_id=classroom["id"],
        title="Lista Rascunho",
        questions_spec=[_sample_question(topic["id"])],
        publish=False,
    )
    pub_list = create_list_with_questions(
        client,
        teacher["headers"],
        classroom_id=classroom["id"],
        title="Lista Publicada",
        questions_spec=[_sample_question(topic["id"])],
        publish=True,
    )

    # Before enrollment: available classrooms shows is_enrolled=False
    avail = client.get("/api/v1/student/classrooms/available", headers=student["headers"]).json()
    assert len(avail) == 1
    assert avail[0]["is_enrolled"] is False
    assert avail[0]["published_lists_count"] == 1

    # Enroll
    enroll = client.post(
        f"/api/v1/student/classrooms/{classroom['id']}/enroll",
        headers=student["headers"],
    )
    assert enroll.status_code == 201
    # Duplicate enrollment -> 409
    assert (
        client.post(
            f"/api/v1/student/classrooms/{classroom['id']}/enroll",
            headers=student["headers"],
        ).status_code
        == 409
    )

    # Enrolled student sees only published list
    s_lists = client.get("/api/v1/student/lists", headers=student["headers"]).json()
    assert [item["id"] for item in s_lists] == [pub_list["id"]]

    # Draft list hidden -> 404
    assert (
        client.get(f"/api/v1/student/lists/{draft_list['id']}", headers=student["headers"]).status_code
        == 404
    )

    # Unenrolled student gets 403 on published list
    assert (
        client.get(
            f"/api/v1/student/lists/{pub_list['id']}", headers=other_student["headers"]
        ).status_code
        == 403
    )

    # Student detail MUST NOT include correct_option or explanation
    detail = client.get(f"/api/v1/student/lists/{pub_list['id']}", headers=student["headers"]).json()
    assert detail["attempts_used"] == 0
    assert detail["next_attempt_number"] == 1
    assert detail["can_attempt"] is True
    assert len(detail["questions"]) == 1
    q_obj = detail["questions"][0]
    assert "correct_option" not in q_obj
    assert "explanation" not in q_obj


def test_question_lock_after_submission(client: TestClient) -> None:
    teacher = register_and_login(client, name="Prof", email="prof@synapta.edu", role="teacher")
    student = register_and_login(client, name="Aluno", email="aluno@synapta.edu", role="student")

    t1 = create_topic(client, teacher["headers"], "Frações")
    t2 = create_topic(client, teacher["headers"], "Geometria")
    classroom = create_classroom(client, teacher["headers"], "Turma Lock")
    qlist = create_list_with_questions(
        client,
        teacher["headers"],
        classroom_id=classroom["id"],
        title="Lista Travada Após Submissão",
        questions_spec=[_sample_question(t1["id"], "Quanto é 1/2 + 1/2?", "A")],
        publish=True,
    )
    q_id = qlist["questions"][0]["id"]

    client.post(f"/api/v1/student/classrooms/{classroom['id']}/enroll", headers=student["headers"])
    sub = client.post(
        f"/api/v1/student/lists/{qlist['id']}/submit",
        headers=student["headers"],
        json={"answers": [{"question_id": q_id, "selected_option": "A"}]},
    )
    assert sub.status_code == 201

    # Adding question -> 409
    assert (
        client.post(
            f"/api/v1/teacher/lists/{qlist['id']}/questions",
            headers=teacher["headers"],
            json=_sample_question(t1["id"], "Nova questão"),
        ).status_code
        == 409
    )

    # Deleting question -> 409
    assert (
        client.delete(f"/api/v1/teacher/questions/{q_id}", headers=teacher["headers"]).status_code == 409
    )

    # Modifying correct_option, options, or topic_id -> 409
    assert (
        client.patch(
            f"/api/v1/teacher/questions/{q_id}",
            headers=teacher["headers"],
            json={"correct_option": "B"},
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/api/v1/teacher/questions/{q_id}",
            headers=teacher["headers"],
            json={"topic_id": t2["id"]},
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/api/v1/teacher/questions/{q_id}",
            headers=teacher["headers"],
            json={"options": {"A": "1", "B": "2", "C": "3", "D": "4"}},
        ).status_code
        == 409
    )

    # Modifying statement, explanation, order_index -> 200 OK
    ok_edit = client.patch(
        f"/api/v1/teacher/questions/{q_id}",
        headers=teacher["headers"],
        json={
            "statement": "Enunciado revisado: quanto é 1/2 + 1/2?",
            "explanation": "Explicação aprimorada: 1/2 + 1/2 = 2/2 = 1.",
            "order_index": 2,
        },
    )
    assert ok_edit.status_code == 200
    assert ok_edit.json()["statement"] == "Enunciado revisado: quanto é 1/2 + 1/2?"
    assert ok_edit.json()["order_index"] == 2
