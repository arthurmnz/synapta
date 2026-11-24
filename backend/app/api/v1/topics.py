from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_role
from app.models.user import User
from app.schemas.topic import TopicCreate, TopicOut
from app.services import classroom_service

router = APIRouter(prefix="/topics", tags=["topics"])
require_teacher = require_role("teacher")


@router.get("", response_model=list[TopicOut])
def list_topics(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TopicOut]:
    """List all available subjects/topics ordered alphabetically."""
    return classroom_service.list_topics(db)


@router.post("", response_model=TopicOut, status_code=status.HTTP_201_CREATED)
def create_topic(
    payload: TopicCreate,
    _: User = Depends(require_teacher),
    db: Session = Depends(get_db),
) -> TopicOut:
    """Create a new subject/topic (teacher only)."""
    return classroom_service.create_topic(db, payload)
