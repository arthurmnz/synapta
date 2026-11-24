from fastapi.testclient import TestClient

from tests.conftest import (
    create_classroom,
    create_list_with_questions,
    create_organization,
    create_topic,
    register_and_login,
)


def _sample_question(topic_id: str, statement: str = "Questão teste", correct: str = "A") -> dict:
    return {
        "topic_id": topic_id,
        "statement": statement,
        "options": {"A": "Opção A", "B": "Opção B", "C": "Opção C", "D": "Opção D"},
        "correct_option": correct,
        "explanation": "Explicação detalhada.",
    }


def test_organization_crud_visibility_validation_and_classroom_detachment(client: TestClient) -> None:
    t1 = register_and_login(client, name="Prof Ana", email="ana@synapta.edu", role="teacher")
    t2 = register_and_login(client, name="Prof Carlos", email="carlos@synapta.edu", role="teacher")

    # Private org requires 4..64 chars access_code
    bad_priv = client.post(
        "/api/v1/teacher/organizations",
        headers=t1["headers"],
        json={"name": "Org Inválida", "visibility": "private", "access_code": "123"},
    )
    assert bad_priv.status_code == 422

    # Public org ignores/clears access_code
    pub_org = client.post(
        "/api/v1/teacher/organizations",
        headers=t1["headers"],
        json={"name": "Instituto Público", "visibility": "public", "access_code": "IGNORA"},
    )
    assert pub_org.status_code == 201
    pub_data = pub_org.json()
    assert pub_data["visibility"] == "public"
    assert pub_data["access_code"] is None
    assert pub_data["is_owner"] is True
    assert pub_data["is_member"] is True

    # Update public -> private without access_code fails (422)
    assert (
        client.patch(
            f"/api/v1/teacher/organizations/{pub_data['id']}",
            headers=t1["headers"],
            json={"visibility": "private"},
        ).status_code
        == 422
    )

    # Update public -> private with valid code succeeds
    priv_updated = client.patch(
        f"/api/v1/teacher/organizations/{pub_data['id']}",
        headers=t1["headers"],
        json={"visibility": "private", "access_code": "SEGREDO26"},
    )
    assert priv_updated.status_code == 200
    assert priv_updated.json()["visibility"] == "private"
    assert priv_updated.json()["access_code"] == "SEGREDO26"

    # Partial update preserves private access_code
    renamed = client.patch(
        f"/api/v1/teacher/organizations/{pub_data['id']}",
        headers=t1["headers"],
        json={"name": "Instituto Privado"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["visibility"] == "private"
    assert renamed.json()["access_code"] == "SEGREDO26"

    # Non-owner teacher cannot see access_code, patch, or delete
    t2_orgs = client.get("/api/v1/teacher/organizations", headers=t2["headers"]).json()
    assert len(t2_orgs) == 1
    assert t2_orgs[0]["is_owner"] is False
    assert t2_orgs[0]["is_member"] is False
    assert t2_orgs[0]["access_code"] is None

    assert (
        client.patch(
            f"/api/v1/teacher/organizations/{pub_data['id']}",
            headers=t2["headers"],
            json={"name": "Hack"},
        ).status_code
        == 403
    )
    assert (
        client.delete(
            f"/api/v1/teacher/organizations/{pub_data['id']}",
            headers=t2["headers"],
        ).status_code
        == 403
    )

    # Create a classroom inside the organization, then delete the organization -> classroom survives detached
    classroom = create_classroom(
        client, t1["headers"], "Turma Vinculada", organization_id=pub_data["id"]
    )
    assert classroom["organization_id"] == pub_data["id"]

    del_resp = client.delete(
        f"/api/v1/teacher/organizations/{pub_data['id']}",
        headers=t1["headers"],
    )
    assert del_resp.status_code == 204

    remaining = client.get("/api/v1/teacher/classrooms", headers=t1["headers"]).json()
    assert len(remaining) == 1
    assert remaining[0]["id"] == classroom["id"]
    assert remaining[0]["organization_id"] is None
    assert remaining[0]["organization_name"] is None


def test_multi_teacher_organization_and_non_owner_code_hiding(client: TestClient) -> None:
    owner = register_and_login(client, name="Prof Dona", email="dona@synapta.edu", role="teacher")
    colleague = register_and_login(
        client, name="Prof Colega", email="colega@synapta.edu", role="teacher"
    )

    org = create_organization(
        client,
        owner["headers"],
        "Colégio Vértice",
        visibility="private",
        access_code="VERTICE26",
    )

    # Colleague cannot create classroom inside org before joining
    blocked = client.post(
        "/api/v1/teacher/classrooms",
        headers=colleague["headers"],
        json={"name": "Turma Sem Acesso", "organization_id": org["id"]},
    )
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "FORBIDDEN_ORGANIZATION"

    # Colleague cannot join private org with wrong code
    wrong_join = client.post(
        f"/api/v1/teacher/organizations/{org['id']}/join",
        headers=colleague["headers"],
        json={"access_code": "ERRADO"},
    )
    assert wrong_join.status_code == 403
    assert wrong_join.json()["code"] == "INVALID_ACCESS_CODE"

    # Colleague joins with valid code (with whitespace trimmed)
    ok_join = client.post(
        f"/api/v1/teacher/organizations/{org['id']}/join",
        headers=colleague["headers"],
        json={"access_code": "  VERTICE26  "},
    )
    assert ok_join.status_code == 201
    assert ok_join.json()["member_role"] == "teacher"

    # Duplicate join -> 409
    assert (
        client.post(
            f"/api/v1/teacher/organizations/{org['id']}/join",
            headers=colleague["headers"],
            json={"access_code": "VERTICE26"},
        ).status_code
        == 409
    )

    # Colleague is member but NOT owner, so org access_code remains hidden
    colleague_orgs = client.get("/api/v1/teacher/organizations", headers=colleague["headers"]).json()
    assert colleague_orgs[0]["is_member"] is True
    assert colleague_orgs[0]["is_owner"] is False
    assert colleague_orgs[0]["access_code"] is None
    assert colleague_orgs[0]["teacher_count"] == 2

    # Owner and colleague both create classrooms in the same organization
    c_owner = create_classroom(
        client,
        owner["headers"],
        "Turma Dona Privada",
        organization_id=org["id"],
        visibility="private",
        access_code="DONA26",
    )
    c_colleague = create_classroom(
        client,
        colleague["headers"],
        "Turma Colega Privada",
        organization_id=org["id"],
        visibility="private",
        access_code="COLEGA26",
    )

    # Viewing org classrooms as colleague exposes ONLY colleague's own classroom access_code
    org_classrooms = client.get(
        f"/api/v1/teacher/organizations/{org['id']}/classrooms",
        headers=colleague["headers"],
    ).json()
    by_id = {c["id"]: c for c in org_classrooms}
    assert by_id[c_owner["id"]]["access_code"] is None
    assert by_id[c_colleague["id"]]["access_code"] == "COLEGA26"


def test_student_layered_access_control_across_org_classroom_and_list(client: TestClient) -> None:
    teacher = register_and_login(client, name="Prof Ana", email="ana@synapta.edu", role="teacher")
    student = register_and_login(client, name="Aluno Lucas", email="lucas@synapta.edu", role="student")

    topic = create_topic(client, teacher["headers"], "Física - Mecânica")

    pub_org = create_organization(client, teacher["headers"], "Instituto Aberto", visibility="public")
    priv_org = create_organization(
        client,
        teacher["headers"],
        "Colégio Privado",
        visibility="private",
        access_code="ORG2026",
    )

    c_independent = create_classroom(client, teacher["headers"], "Turma Sem Org", visibility="public")
    c_pub_org_pub = create_classroom(
        client, teacher["headers"], "Turma Pública Inst", organization_id=pub_org["id"], visibility="public"
    )
    c_priv_org_pub = create_classroom(
        client, teacher["headers"], "Turma Pública Colégio", organization_id=priv_org["id"], visibility="public"
    )
    c_priv_org_priv = create_classroom(
        client,
        teacher["headers"],
        "Turma Privada Colégio",
        organization_id=priv_org["id"],
        visibility="private",
        access_code="TURMA99",
    )

    list_public = create_list_with_questions(
        client,
        teacher["headers"],
        classroom_id=c_priv_org_pub["id"],
        title="Simulado Público da Turma",
        questions_spec=[_sample_question(topic["id"])],
        publish=True,
    )
    list_private = create_list_with_questions(
        client,
        teacher["headers"],
        classroom_id=c_priv_org_pub["id"],
        visibility="private",
        access_code="LISTA77",
        title="Simulado Privado da Turma",
        questions_spec=[_sample_question(topic["id"], "Questão fechada", "C")],
        publish=True,
    )

    # 1) Student discovers organizations (never sees access_code)
    student_orgs = client.get("/api/v1/student/organizations", headers=student["headers"]).json()
    assert len(student_orgs) == 2
    assert all("access_code" not in org for org in student_orgs)
    priv_org_card = next(o for o in student_orgs if o["id"] == priv_org["id"])
    assert priv_org_card["visibility"] == "private"
    assert priv_org_card["is_member"] is False
    assert priv_org_card["public_classroom_count"] == 1
    assert priv_org_card["total_classroom_count"] == 2

    # 2) Private org classrooms are NOT leaked in /student/classrooms/available before joining
    avail_before = client.get("/api/v1/student/classrooms/available", headers=student["headers"]).json()
    avail_ids_before = {c["id"] for c in avail_before}
    assert avail_ids_before == {c_independent["id"], c_pub_org_pub["id"]}
    assert all("access_code" not in c for c in avail_before)

    # Direct org classrooms listing & enroll inside private org blocked -> 403 ORGANIZATION_ACCESS_REQUIRED
    org_rooms_blocked = client.get(
        f"/api/v1/student/organizations/{priv_org['id']}/classrooms",
        headers=student["headers"],
    )
    assert org_rooms_blocked.status_code == 403
    assert org_rooms_blocked.json()["code"] == "ORGANIZATION_ACCESS_REQUIRED"

    enroll_blocked = client.post(
        f"/api/v1/student/classrooms/{c_priv_org_pub['id']}/enroll",
        headers=student["headers"],
    )
    assert enroll_blocked.status_code == 403
    assert enroll_blocked.json()["code"] == "ORGANIZATION_ACCESS_REQUIRED"

    # 3) Student joins private org permanently
    assert (
        client.post(
            f"/api/v1/student/organizations/{priv_org['id']}/join",
            headers=student["headers"],
            json={"access_code": "ERRADO"},
        ).status_code
        == 403
    )
    join_ok = client.post(
        f"/api/v1/student/organizations/{priv_org['id']}/join",
        headers=student["headers"],
        json={"access_code": "ORG2026"},
    )
    assert join_ok.status_code == 201
    assert join_ok.json()["member_role"] == "student"

    # Now student sees BOTH classrooms of priv_org (public and private with padlock)
    priv_org_rooms = client.get(
        f"/api/v1/student/organizations/{priv_org['id']}/classrooms",
        headers=student["headers"],
    ).json()
    assert {c["id"] for c in priv_org_rooms} == {c_priv_org_pub["id"], c_priv_org_priv["id"]}

    # 4) Joining private org allows enrolling in its PUBLIC classroom without code,
    #    but its PRIVATE classroom STILL requires its own classroom access_code!
    assert (
        client.post(
            f"/api/v1/student/classrooms/{c_priv_org_pub['id']}/enroll",
            headers=student["headers"],
        ).status_code
        == 201
    )
    priv_enroll_no_code = client.post(
        f"/api/v1/student/classrooms/{c_priv_org_priv['id']}/enroll",
        headers=student["headers"],
    )
    assert priv_enroll_no_code.status_code == 403
    assert priv_enroll_no_code.json()["code"] == "INVALID_ACCESS_CODE"

    priv_enroll_ok = client.post(
        f"/api/v1/student/classrooms/{c_priv_org_priv['id']}/enroll",
        headers=student["headers"],
        json={"access_code": "TURMA99"},
    )
    assert priv_enroll_ok.status_code == 201

    # 5) Inside c_priv_org_pub, student sees BOTH lists in /student/lists, with private one locked
    s_lists = client.get(
        f"/api/v1/student/lists?classroom_id={c_priv_org_pub['id']}",
        headers=student["headers"],
    ).json()
    by_list_id = {item["id"]: item for item in s_lists}
    assert by_list_id[list_public["id"]]["is_unlocked"] is True
    assert by_list_id[list_private["id"]]["visibility"] == "private"
    assert by_list_id[list_private["id"]]["is_unlocked"] is False
    assert "access_code" not in by_list_id[list_private["id"]]

    # Locked private list refuses detail (never leaks questions) and refuses submit
    locked_detail = client.get(
        f"/api/v1/student/lists/{list_private['id']}",
        headers=student["headers"],
    )
    assert locked_detail.status_code == 403
    assert locked_detail.json()["code"] == "LIST_LOCKED"

    locked_submit = client.post(
        f"/api/v1/student/lists/{list_private['id']}/submit",
        headers=student["headers"],
        json={
            "answers": [
                {"question_id": list_private["questions"][0]["id"], "selected_option": "C"}
            ]
        },
    )
    assert locked_submit.status_code == 403
    assert locked_submit.json()["code"] == "LIST_LOCKED"

    # Unlocking public list -> 400 LIST_NOT_PRIVATE
    assert (
        client.post(
            f"/api/v1/student/lists/{list_public['id']}/unlock",
            headers=student["headers"],
            json={"access_code": "QUALQUER"},
        ).status_code
        == 400
    )

    # Wrong code on private list -> 403 INVALID_ACCESS_CODE
    bad_unlock = client.post(
        f"/api/v1/student/lists/{list_private['id']}/unlock",
        headers=student["headers"],
        json={"access_code": "ERRADA"},
    )
    assert bad_unlock.status_code == 403
    assert bad_unlock.json()["code"] == "INVALID_ACCESS_CODE"

    # Valid code unlocks permanently and returns StudentListDetailOut (without correct_option)
    ok_unlock = client.post(
        f"/api/v1/student/lists/{list_private['id']}/unlock",
        headers=student["headers"],
        json={"access_code": "LISTA77"},
    )
    assert ok_unlock.status_code == 200
    unlocked_body = ok_unlock.json()
    assert unlocked_body["is_unlocked"] is True
    assert len(unlocked_body["questions"]) == 1
    assert "correct_option" not in unlocked_body["questions"][0]

    # Subsequent GET and submit succeed without code
    assert (
        client.get(
            f"/api/v1/student/lists/{list_private['id']}", headers=student["headers"]
        ).status_code
        == 200
    )
    sub_resp = client.post(
        f"/api/v1/student/lists/{list_private['id']}/submit",
        headers=student["headers"],
        json={
            "answers": [
                {"question_id": list_private["questions"][0]["id"], "selected_option": "C"}
            ]
        },
    )
    assert sub_resp.status_code == 201
    assert sub_resp.json()["score_percentage"] == 100.0
    assert sub_resp.json()["organization_id"] == priv_org["id"]
    assert sub_resp.json()["classroom_id"] == c_priv_org_pub["id"]


def test_unpublished_private_list_returns_404_and_unlock_checks_enrollment_first(
    client: TestClient,
) -> None:
    teacher = register_and_login(client, name="Prof Ana", email="ana@synapta.edu", role="teacher")
    enrolled_student = register_and_login(
        client, name="Aluno Matriculado", email="mat@synapta.edu", role="student"
    )
    outsider_student = register_and_login(
        client, name="Aluno Externo", email="ext@synapta.edu", role="student"
    )

    topic = create_topic(client, teacher["headers"], "História do Brasil")
    classroom = create_classroom(client, teacher["headers"], "Turma Controle")

    draft_private = create_list_with_questions(
        client,
        teacher["headers"],
        classroom_id=classroom["id"],
        visibility="private",
        access_code="SEGREDO",
        title="Rascunho Privado",
        questions_spec=[_sample_question(topic["id"], "Questão rascunho", "A")],
        publish=False,
    )
    pub_public = create_list_with_questions(
        client,
        teacher["headers"],
        classroom_id=classroom["id"],
        visibility="public",
        title="Simulado Público",
        questions_spec=[_sample_question(topic["id"], "Questão pública", "B")],
        publish=True,
    )

    assert (
        client.post(
            f"/api/v1/student/classrooms/{classroom['id']}/enroll",
            headers=enrolled_student["headers"],
        ).status_code
        == 201
    )

    # Unpublished private list MUST return 404 LIST_NOT_FOUND (never 403 LIST_LOCKED)
    for caller_headers in (enrolled_student["headers"], outsider_student["headers"]):
        get_resp = client.get(
            f"/api/v1/student/lists/{draft_private['id']}",
            headers=caller_headers,
        )
        assert get_resp.status_code == 404
        assert get_resp.json()["code"] == "LIST_NOT_FOUND"

        submit_resp = client.post(
            f"/api/v1/student/lists/{draft_private['id']}/submit",
            headers=caller_headers,
            json={
                "answers": [
                    {"question_id": draft_private["questions"][0]["id"], "selected_option": "A"}
                ]
            },
        )
        assert submit_resp.status_code == 404
        assert submit_resp.json()["code"] == "LIST_NOT_FOUND"

        unlock_draft_resp = client.post(
            f"/api/v1/student/lists/{draft_private['id']}/unlock",
            headers=caller_headers,
            json={"access_code": "SEGREDO"},
        )
        assert unlock_draft_resp.status_code == 404
        assert unlock_draft_resp.json()["code"] == "LIST_NOT_FOUND"

    # Unenrolled student calling /unlock on a published public classroom list gets 403 NOT_ENROLLED
    # (never leaking 400 LIST_NOT_PRIVATE)
    outsider_unlock = client.post(
        f"/api/v1/student/lists/{pub_public['id']}/unlock",
        headers=outsider_student["headers"],
        json={"access_code": "QUALQUER"},
    )
    assert outsider_unlock.status_code == 403
    assert outsider_unlock.json()["code"] == "NOT_ENROLLED"
