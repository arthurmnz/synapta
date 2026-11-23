from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """SQLAlchemy declarative base class for all Synapta models."""


def register_models() -> None:
    """Import all ORM models so Base.metadata includes every table."""
    import app.models  # noqa: F401
