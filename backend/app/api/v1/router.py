from fastapi import APIRouter

from app.api.v1 import auth, health, student, teacher, topics

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(topics.router)
api_router.include_router(teacher.router)
api_router.include_router(student.router)
