from fastapi import Request
from fastapi.responses import JSONResponse


class APIError(Exception):
    """Structured HTTP error matching {detail, code?} contract."""

    def __init__(
        self,
        status_code: int,
        detail: str,
        code: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code
        self.headers = headers
        super().__init__(detail)


async def api_error_handler(_: Request, exc: APIError) -> JSONResponse:
    """Serialize APIError instances cleanly to FastAPI JSON format."""
    payload: dict[str, str] = {"detail": exc.detail}
    if exc.code:
        payload["code"] = exc.code
    return JSONResponse(status_code=exc.status_code, content=payload, headers=exc.headers)
