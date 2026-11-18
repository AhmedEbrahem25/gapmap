from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str):
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


engine = make_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all(bind=None) -> None:
    # Hackathon choice: create_all + reset script instead of Alembic migrations.
    import app.models  # noqa: F401  (registers every table on Base.metadata)

    Base.metadata.create_all(bind=bind or engine)


def drop_all(bind=None) -> None:
    import app.models  # noqa: F401

    Base.metadata.drop_all(bind=bind or engine)
