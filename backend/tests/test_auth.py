from app.core.config import settings


def test_tc01_valid_login_returns_token_and_user(client):
    res = client.post(
        "/api/auth/login", json={"email": "instructor@gapmap.test", "password": settings.demo_password}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["access_token"]
    assert body["user"]["role"] == "instructor"


def test_login_email_is_case_insensitive(client):
    res = client.post(
        "/api/auth/login", json={"email": " STU001@GapMap.test ", "password": settings.demo_password}
    )
    assert res.status_code == 200
    assert res.json()["user"]["student_ref"] == "STU001"


def test_wrong_password_is_rejected_with_clear_message(client):
    res = client.post("/api/auth/login", json={"email": "instructor@gapmap.test", "password": "wrong"})
    assert res.status_code == 401
    assert "Incorrect email or password" in res.json()["detail"]


def test_me_requires_a_token(client):
    assert client.get("/api/me").status_code == 401


def test_me_rejects_a_forged_token(client):
    res = client.get("/api/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert res.status_code == 401


def test_me_returns_current_user(client, login):
    res = client.get("/api/me", headers=login("stu001@gapmap.test"))
    assert res.status_code == 200
    assert res.json()["email"] == "stu001@gapmap.test"
