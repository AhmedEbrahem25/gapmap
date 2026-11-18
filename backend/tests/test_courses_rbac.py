def test_instructor_sees_only_own_courses(client, login, demo):
    res = client.get("/api/courses", headers=login("instructor@gapmap.test"))
    assert [c["id"] for c in res.json()] == [str(demo["course_id"])]


def test_student_sees_only_enrolled_courses(client, login, demo):
    res = client.get("/api/courses", headers=login("stu001@gapmap.test"))
    assert [c["id"] for c in res.json()] == [str(demo["course_id"])]


def test_coordinator_and_admin_see_all_courses(client, login):
    for email in ("coordinator@gapmap.test", "admin@gapmap.test"):
        assert len(client.get("/api/courses", headers=login(email)).json()) == 2


def test_course_detail_for_enrolled_student(client, login, demo):
    res = client.get(f"/api/courses/{demo['course_id']}", headers=login("stu001@gapmap.test"))
    assert res.status_code == 200
    body = res.json()
    assert body["student_count"] == 20
    assert body["material_count"] == 1
    assert {c["name"] for c in body["concepts"]} == {"Agile", "Scrum Roles", "Requirements"}


def test_tc20_student_not_enrolled_is_denied(client, login, demo):
    res = client.get(f"/api/courses/{demo['other_course_id']}", headers=login("stu001@gapmap.test"))
    assert res.status_code == 403


def test_instructor_of_another_course_is_denied(client, login, demo):
    res = client.get(f"/api/courses/{demo['course_id']}", headers=login("instructor2@gapmap.test"))
    assert res.status_code == 403


def test_unknown_course_is_404(client, login):
    res = client.get(
        "/api/courses/00000000-0000-0000-0000-000000000000", headers=login("admin@gapmap.test")
    )
    assert res.status_code == 404
