from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.db import create_all, get_db
from app.main import app
from app.seed.demo import seed_demo


@dataclass
class DemoDb:
    session_factory: sessionmaker
    demo: dict


def make_demo_db(**seed_kwargs) -> DemoDb:
    """A new in-memory SQLite database holding the full demo dataset."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as db:
        demo = seed_demo(db, **seed_kwargs)
    return DemoDb(factory, demo)


# Every request goes to whichever database is active: the shared read-only one,
# or a fresh one while a test that writes data is running.
_active: dict[str, DemoDb] = {}


def _override_get_db():
    with _active["db"].session_factory() as session:
        yield session


@pytest.fixture(scope="session", autouse=True)
def _storage(tmp_path_factory):
    settings.storage_dir = tmp_path_factory.mktemp("storage")


@pytest.fixture(scope="session")
def shared_db(_storage) -> DemoDb:
    """Seeded once. Tests using it must not write."""
    return make_demo_db()


@pytest.fixture(scope="session")
def client(shared_db):
    _active["db"] = shared_db
    app.dependency_overrides[get_db] = _override_get_db
    yield TestClient(app)  # no `with`: skips the lifespan, which targets the real database
    app.dependency_overrides.clear()


@pytest.fixture
def fresh(client, shared_db):
    """A private, freshly seeded database for a test that writes data."""
    demo_db = make_demo_db()
    _active["db"] = demo_db
    yield demo_db
    _active["db"] = shared_db


@pytest.fixture
def fresh_no_results(client, shared_db):
    """Like `fresh`, but without the pre-approved results import."""
    demo_db = make_demo_db(with_results=False)
    _active["db"] = demo_db
    yield demo_db
    _active["db"] = shared_db


@pytest.fixture
def demo(request) -> dict:
    """Ids from whichever database this test uses."""
    for name in ("fresh", "fresh_no_results"):
        if name in request.fixturenames:
            return request.getfixturevalue(name).demo
    return request.getfixturevalue("shared_db").demo


@pytest.fixture
def db(request):
    for name in ("fresh", "fresh_no_results"):
        if name in request.fixturenames:
            demo_db = request.getfixturevalue(name)
            break
    else:
        demo_db = request.getfixturevalue("shared_db")
    with demo_db.session_factory() as session:
        yield session


@pytest.fixture(scope="session")
def login(client):
    def _login(email: str) -> dict[str, str]:
        res = client.post("/api/auth/login", json={"email": email, "password": settings.demo_password})
        assert res.status_code == 200, res.text
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    return _login
