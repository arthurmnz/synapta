from pathlib import Path
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env files."""

    APP_NAME: str = "Synapta API"
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str
    TEST_DATABASE_URL: str | None = None

    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    SEED_ON_START: bool = True

    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_ROOT / ".env"), str(PROJECT_ROOT / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key_length(cls, value: str) -> str:
        if len(value.strip()) < 32:
            raise ValueError("SECRET_KEY deve possuir pelo menos 32 caracteres.")
        return value

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str]:
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                import json

                parsed = json.loads(stripped)
                return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in stripped.split(",") if item.strip()]
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return ["http://localhost:5173", "http://127.0.0.1:5173"]


settings = Settings()
