from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.topic import TopicOut
from app.services import classroom_service

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("", response_model=list[TopicOut])
def list_topics(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TopicOut]:
    """List all available mathematics topics."""
    return classroom_service.list_topics(db)
