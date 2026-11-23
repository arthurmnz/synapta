import os
import sys
import time

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings


def wait_for_database(
    database_url: str | None = None,
    max_attempts: int = 30,
    interval_seconds: float = 1.0,
) -> bool:
    """Wait until PostgreSQL accepts connections and answers SELECT 1."""
    raw_url = database_url or settings.DATABASE_URL
    parsed = make_url(raw_url)
    target_label = f"{parsed.host or 'localhost'}:{parsed.port or 5432}/{parsed.database or ''}"

    engine = create_engine(
        raw_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 3},
    )
    try:
        for attempt in range(1, max_attempts + 1):
            try:
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                print(f"[wait_for_db] PostgreSQL pronto em {target_label}.", flush=True)
                return True
            except (SQLAlchemyError, OSError) as exc:
                print(
                    f"[wait_for_db] Aguardando PostgreSQL em {target_label} "
                    f"(tentativa {attempt}/{max_attempts}): {exc}",
                    flush=True,
                )
                if attempt < max_attempts:
                    time.sleep(interval_seconds)
        return False
    finally:
        engine.dispose()


def main() -> None:
    """CLI entrypoint for container startup database readiness check."""
    max_attempts = int(os.environ.get("DB_WAIT_MAX_ATTEMPTS", "30"))
    interval = float(os.environ.get("DB_WAIT_INTERVAL_SECONDS", "1.0"))
    if not wait_for_database(max_attempts=max_attempts, interval_seconds=interval):
        print("[wait_for_db] Tempo limite esgotado aguardando o PostgreSQL.", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
