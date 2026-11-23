from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import APIError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut


def build_user_out(user: User) -> UserOut:
    """Map a User ORM instance to UserOut schema."""
    return UserOut.model_validate(user)


def register_user(db: Session, payload: RegisterRequest) -> TokenResponse:
    """Register a new user account and issue a JWT access token."""
    normalized_email = payload.email.strip().lower()
    existing = db.scalar(select(User).where(User.email == normalized_email))
    if existing is not None:
        raise APIError(
            status_code=409,
            detail="Já existe uma conta cadastrada com este e-mail.",
            code="EMAIL_ALREADY_EXISTS",
        )

    user = User(
        name=payload.name,
        email=normalized_email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIError(
            status_code=409,
            detail="Já existe uma conta cadastrada com este e-mail.",
            code="EMAIL_ALREADY_EXISTS",
        )
    db.refresh(user)

    token = create_access_token(subject=str(user.id), role=user.role)
    return TokenResponse(access_token=token, user=build_user_out(user))


def authenticate_user(db: Session, payload: LoginRequest) -> TokenResponse:
    """Authenticate an existing user by email and password."""
    normalized_email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise APIError(
            status_code=401,
            detail="E-mail ou senha inválidos.",
            code="INVALID_CREDENTIALS",
        )

    token = create_access_token(subject=str(user.id), role=user.role)
    return TokenResponse(access_token=token, user=build_user_out(user))
