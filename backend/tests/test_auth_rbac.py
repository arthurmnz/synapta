from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, settings
from app.models.user import User
from tests.conftest import register_and_login


def test_health_check(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SEED_ON_START", False)
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "database": "ok", "demo_mode": False}

    monkeypatch.setattr(settings, "SEED_ON_START", True)
    resp_demo = client.get("/api/v1/health")
    assert resp_demo.status_code == 200
    assert resp_demo.json() == {"status": "ok", "database": "ok", "demo_mode": True}


def test_register_login_and_me(client: TestClient, db_session: Session) -> None:
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "name": "  Maria Clara  ",
            "email": "Maria.Clara@Synapta.EDU",
            "password": "Password123!",
            "role": "student",
        },
    )
    assert reg_resp.status_code == 201
    reg_data = reg_resp.json()
    assert reg_data["token_type"] == "bearer"
    assert reg_data["user"]["email"] == "maria.clara@synapta.edu"
    assert reg_data["user"]["name"] == "Maria Clara"
    assert reg_data["user"]["role"] == "student"

    db_user = db_session.scalar(select(User).where(User.email == "maria.clara@synapta.edu"))
    assert db_user is not None
    assert db_user.password_hash != "Password123!"

    dup_resp = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Outra Maria",
            "email": "MARIA.CLARA@synapta.edu",
            "password": "Password123!",
            "role": "teacher",
        },
    )
    assert dup_resp.status_code == 409
    assert dup_resp.json()["code"] == "EMAIL_ALREADY_EXISTS"

    bad_login = client.post(
        "/api/v1/auth/login",
        json={"email": "maria.clara@synapta.edu", "password": "WrongPassword"},
    )
    assert bad_login.status_code == 401

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "  MARIA.CLARA@synapta.edu ", "password": "Password123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "maria.clara@synapta.edu"


def test_rbac_and_authentication_enforcement(client: TestClient) -> None:
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/topics").status_code == 401
    assert (
        client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.jwt.token"}).status_code
        == 401
    )

    student = register_and_login(client, name="Aluno Teste", email="aluno@synapta.edu", role="student")
    teacher = register_and_login(
        client, name="Prof Teste", email="prof@synapta.edu", role="teacher"
    )

    # Student blocked from teacher routes
    assert client.get("/api/v1/teacher/classrooms", headers=student["headers"]).status_code == 403
    assert (
        client.post(
            "/api/v1/teacher/topics",
            headers=student["headers"],
            json={"name": "Trigonometria"},
        ).status_code
        == 403
    )

    # Teacher blocked from student routes
    assert client.get("/api/v1/student/classrooms", headers=teacher["headers"]).status_code == 403
    assert client.get("/api/v1/student/lists", headers=teacher["headers"]).status_code == 403

    # Teacher creates topic with Portuguese accents -> normalized slug; duplicate -> 409
    topic_resp = client.post(
        "/api/v1/teacher/topics",
        headers=teacher["headers"],
        json={"name": "Frações e Proporção", "description": "Conteúdo base"},
    )
    assert topic_resp.status_code == 201
    assert topic_resp.json()["slug"] == "fracoes-e-proporcao"

    dup_topic = client.post(
        "/api/v1/teacher/topics",
        headers=teacher["headers"],
        json={"name": "frações e proporção"},
    )
    assert dup_topic.status_code == 409

    # Both teacher and student can list topics
    assert len(client.get("/api/v1/topics", headers=student["headers"]).json()) == 1
    assert len(client.get("/api/v1/topics", headers=teacher["headers"]).json()) == 1


def test_settings_secret_key_min_length_and_cors_hardening(client: TestClient) -> None:
    with pytest.raises(ValidationError):
        Settings(
            DATABASE_URL="postgresql+psycopg://localhost/synapta_test",
            SECRET_KEY="too-short-key",
        )

    preflight = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization,Content-Type",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert preflight.headers.get("access-control-allow-credentials") is None
