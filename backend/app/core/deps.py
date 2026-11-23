from collections.abc import Callable, Generator
import uuid

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy.orm import Session

from app.core.exceptions import APIError
from app.core.security import decode_access_token
from app.db.session import get_session
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a SQLAlchemy session."""
    yield from get_session()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Authenticate caller from Bearer JWT and return the corresponding User."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise APIError(
            status_code=401,
            detail="Autenticação necessária.",
            code="NOT_AUTHENTICATED",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
        subject = payload.get("sub")
        user_id = uuid.UUID(str(subject))
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise APIError(
            status_code=401,
            detail="Token de acesso inválido ou expirado.",
            code="INVALID_TOKEN",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.get(User, user_id)
    if user is None:
        raise APIError(
            status_code=401,
            detail="Usuário não encontrado para este token.",
            code="INVALID_TOKEN",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_role(*allowed_roles: str) -> Callable[[User], User]:
    """Dependency factory enforcing RBAC role membership."""

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise APIError(
                status_code=403,
                detail="Você não tem permissão para acessar este recurso.",
                code="FORBIDDEN_ROLE",
            )
        return current_user

    return role_checker
