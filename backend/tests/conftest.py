from collections.abc import Generator
import os
from pathlib import Path
from uuid import UUID

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.deps import get_db
from app.db.base import Base
from app.main import create_app


def _resolve_test_db_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or settings.TEST_DATABASE_URL
    if not url:
        raise RuntimeError("TEST_DATABASE_URL deve estar configurada para executar os testes.")
    if "test" not in url.rsplit("/", 1)[-1].lower():
        raise RuntimeError(f"Banco de testes inválido (esperado nome com 'test'): {url}")
    return url


TEST_DATABASE_URL = _resolve_test_db_url()
test_engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
TestingSessionLocal = sessionmaker(
    bind=test_engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


@pytest.fixture(scope="session", autouse=True)
def apply_test_migrations() -> Generator[None, None, None]:
    """Ensure Alembic migrations are applied cleanly on the test database."""
    backend_dir = Path(__file__).resolve().parents[1]
    alembic_cfg = Config(str(backend_dir / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    os.environ["ALEMBIC_DATABASE_URL"] = TEST_DATABASE_URL
    command.upgrade(alembic_cfg, "head")
    yield
    os.environ.pop("ALEMBIC_DATABASE_URL", None)


@pytest.fixture(autouse=True)
def clean_db() -> Generator[None, None, None]:
    """Truncate all application tables before each test for full isolation."""
    table_names = [table.name for table in reversed(Base.metadata.sorted_tables)]
    if table_names:
        with test_engine.begin() as conn:
            conn.execute(text(f"TRUNCATE TABLE {', '.join(table_names)} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    """Provide a direct SQLAlchemy session bound to the test database."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    """Provide a FastAPI TestClient wired to the test database with startup seed disabled."""
    original_seed_flag = settings.SEED_ON_START
    settings.SEED_ON_START = False
    app = create_app()

    def override_get_db() -> Generator[Session, None, None]:
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        settings.SEED_ON_START = original_seed_flag


def register_and_login(
    client: TestClient,
    *,
    name: str,
    email: str,
    password: str = "SenhaForte123!",
    role: str = "student",
) -> dict:
    """Register a user and return {token, headers, user}."""
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": name, "email": email, "password": password, "role": role},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    return {
        "token": data["access_token"],
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
        "user": data["user"],
        "user_id": UUID(data["user"]["id"]),
    }


def create_topic(client: TestClient, teacher_headers: dict[str, str], name: str) -> dict:
    """Create a mathematics topic via teacher endpoint."""
    resp = client.post(
        "/api/v1/teacher/topics",
        headers=teacher_headers,
        json={"name": name, "description": f"Descrição de {name}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def create_classroom(client: TestClient, teacher_headers: dict[str, str], name: str) -> dict:
    """Create a classroom via teacher endpoint."""
    resp = client.post(
        "/api/v1/teacher/classrooms",
        headers=teacher_headers,
        json={"name": name, "description": f"Turma {name}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def create_list_with_questions(
    client: TestClient,
    teacher_headers: dict[str, str],
    *,
    classroom_id: str,
    title: str,
    questions_spec: list[dict],
    publish: bool = True,
) -> dict:
    """Create a list, add questions, optionally publish it, and return list detail."""
    list_resp = client.post(
        "/api/v1/teacher/lists",
        headers=teacher_headers,
        json={"classroom_id": classroom_id, "title": title, "description": "Descrição da lista"},
    )
    assert list_resp.status_code == 201, list_resp.text
    list_id = list_resp.json()["id"]

    for q in questions_spec:
        q_resp = client.post(
            f"/api/v1/teacher/lists/{list_id}/questions",
            headers=teacher_headers,
            json=q,
        )
        assert q_resp.status_code == 201, q_resp.text

    if publish:
        pub_resp = client.patch(
            f"/api/v1/teacher/lists/{list_id}",
            headers=teacher_headers,
            json={"is_published": True},
        )
        assert pub_resp.status_code == 200, pub_resp.text
        return pub_resp.json()

    detail_resp = client.get(f"/api/v1/teacher/lists/{list_id}", headers=teacher_headers)
    assert detail_resp.status_code == 200, detail_resp.text
    return detail_resp.json()
