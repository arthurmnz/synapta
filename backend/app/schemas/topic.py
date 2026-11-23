from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TopicCreate(BaseModel):
    """Payload to create a new mathematics topic."""

    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("O nome do assunto deve ter pelo menos 2 caracteres.")
        return cleaned

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class TopicOut(BaseModel):
    """Mathematics topic summary."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    description: str | None = None
