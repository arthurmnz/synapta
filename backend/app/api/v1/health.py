from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db
from app.core.exceptions import APIError

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)) -> dict[str, str | bool]:
    """Check API liveness, PostgreSQL connectivity, and runtime demo mode flag."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise APIError(
            status_code=503,
            detail="Falha na conexão com o banco de dados.",
            code="DATABASE_UNAVAILABLE",
        ) from exc
    return {
        "status": "ok",
        "database": "ok",
        "demo_mode": bool(settings.SEED_ON_START),
    }
