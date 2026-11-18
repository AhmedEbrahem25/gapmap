from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> repo root is three levels above `app`
_REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(_REPO_ROOT / ".env", ".env"), extra="ignore")

    # Postgres in Docker; SQLite works for local dev and tests.
    database_url: str = f"sqlite:///{(_REPO_ROOT / 'backend' / 'gapmap.db').as_posix()}"

    jwt_secret: str = "dev-only-insecure-secret-set-JWT_SECRET-in-env"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 8 * 60

    # Uploaded files and rendered page images.
    storage_dir: Path = _REPO_ROOT / "storage"
    # Sample CSVs and templates (data/ in the repo).
    data_dir: Path = _REPO_ROOT / "data"
    max_upload_mb: int = 25

    # Used only by the seed script for demo accounts.
    demo_password: str = "demo1234"

    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
