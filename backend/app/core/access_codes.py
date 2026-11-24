import hmac
from typing import Any

from app.core.exceptions import APIError

MIN_ACCESS_CODE_LENGTH = 4
MAX_ACCESS_CODE_LENGTH = 64


def normalize_access_code(code: str | None) -> str | None:
    """Trim whitespace from an access code and return None when empty."""
    if code is None:
        return None
    cleaned = code.strip()
    return cleaned or None


def verify_access_code(provided: str | None, stored: str | None) -> bool:
    """Compare a provided access code against the stored code in constant time."""
    norm_provided = normalize_access_code(provided)
    norm_stored = normalize_access_code(stored)
    if norm_provided is None or norm_stored is None:
        return False
    return hmac.compare_digest(
        norm_provided.encode("utf-8"),
        norm_stored.encode("utf-8"),
    )


def validate_visibility_and_code(
    visibility: str,
    access_code: str | None,
) -> tuple[str, str | None]:
    """Validate visibility/access_code pairing: private requires 4..64 chars, public forces None."""
    if visibility not in ("public", "private"):
        raise ValueError("A visibilidade deve ser 'public' ou 'private'.")

    if visibility == "public":
        return "public", None

    normalized = normalize_access_code(access_code)
    if (
        normalized is None
        or len(normalized) < MIN_ACCESS_CODE_LENGTH
        or len(normalized) > MAX_ACCESS_CODE_LENGTH
    ):
        raise ValueError(
            f"Classes privadas exigem um código de acesso entre {MIN_ACCESS_CODE_LENGTH} e {MAX_ACCESS_CODE_LENGTH} caracteres."
        )
    return "private", normalized


def apply_visibility_update(
    current_visibility: str,
    current_access_code: str | None,
    data: dict[str, Any],
) -> tuple[str, str | None]:
    """Resolve new (visibility, access_code) during partial PATCH updates."""
    new_visibility = (
        data["visibility"]
        if ("visibility" in data and data["visibility"] is not None)
        else current_visibility
    )
    if new_visibility == "public":
        return "public", None

    if "access_code" in data:
        candidate = normalize_access_code(data["access_code"])
    else:
        candidate = normalize_access_code(current_access_code)

    if (
        candidate is None
        or len(candidate) < MIN_ACCESS_CODE_LENGTH
        or len(candidate) > MAX_ACCESS_CODE_LENGTH
    ):
        raise APIError(
            status_code=422,
            detail=(
                f"Classes privadas exigem um código de acesso entre "
                f"{MIN_ACCESS_CODE_LENGTH} e {MAX_ACCESS_CODE_LENGTH} caracteres."
            ),
            code="INVALID_ACCESS_CODE_FORMAT",
        )
    return "private", candidate
