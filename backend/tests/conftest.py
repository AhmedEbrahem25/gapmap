import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.db import create_all, get_db
from app.main import app
from app.seed.demo import seed_demo


@pytest.fixture(scope="session")
def session_factory(tmp_path_factory):
    """In-memory SQLite seeded once with the full demo dataset (tests only read it)."""
    settings.storage_dir = tmp_path_factory.mktemp("storage")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as db:
        factory.demo = seed_demo(db)
    return factory


@pytest.fixture(scope="session")
def demo(session_factory) -> dict:
    return session_factory.demo


@pytest.fixture
def db(session_factory):
    with session_factory() as session:
        yield session


@pytest.fixture(scope="session")
def client(session_factory):
    def override_get_db():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)  # no `with`: skips the lifespan, which targets the real database
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def login(client):
    def _login(email: str) -> dict[str, str]:
        res = client.post("/api/auth/login", json={"email": email, "password": settings.demo_password})
        assert res.status_code == 200, res.text
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    return _login
