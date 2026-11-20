"""FR-05: instructors create courses and enrol student accounts by their reference."""

from sqlalchemy import select

from app.models import AuditLog

INSTRUCTOR = "instructor@gapmap.test"


def _new_course(client, headers, **body):
    res = client.post("/api/courses", headers=headers, json={"title": "Software Testing"} | body)
    assert res.status_code == 201, res.text
    return res.json()


def test_an_instructor_creates_a_course_they_teach(client, login, fresh, db):
    headers = login(INSTRUCTOR)
    course = _new_course(client, headers, title="  Software   Testing ", code="SE402", term=" Spring 2027 ")
    assert (course["title"], course["code"], course["term"]) == ("Software Testing", "SE402", "Spring 2027")
    assert course["instructor_name"] == "Dr. Mona Adel"
    assert course["student_count"] == course["material_count"] == course["exam_count"] == 0
    assert course["id"] in {c["id"] for c in client.get("/api/courses", headers=headers).json()}
    # Nobody else's course list changes
    other = client.get("/api/courses", headers=login("instructor2@gapmap.test")).json()
    assert course["id"] not in {c["id"] for c in other}

    logged = db.scalar(select(AuditLog).where(AuditLog.action == "course.created"))
    assert str(logged.course_id) == course["id"]


def test_only_instructors_and_admins_create_courses(client, login, fresh):
    for email in ("stu001@gapmap.test", "coordinator@gapmap.test"):
        res = client.post("/api/courses", headers=login(email), json={"title": "X"})
        assert res.status_code == 403, email
    assert client.post("/api/courses", headers=login("admin@gapmap.test"), json={"title": "X"}).status_code == 201
    blank = client.post("/api/courses", headers=login(INSTRUCTOR), json={"title": "   "})
    assert blank.status_code == 409


def test_enrol_students_by_reference(client, login, fresh, db):
    headers = login(INSTRUCTOR)
    course = _new_course(client, headers)
    res = client.post(
        f"/api/courses/{course['id']}/enrollments", headers=headers,
        json={"student_refs": ["STU001", " stu002 ", "STU001", "STU999", ""]},
    )
    assert res.status_code == 200, res.text
    result = res.json()
    assert result["enrolled"] == ["STU001", "STU002"]
    assert result["unknown"] == ["STU999"]
    assert [s["student_ref"] for s in result["students"]] == ["STU001", "STU002"]

    again = client.post(f"/api/courses/{course['id']}/enrollments", headers=headers,
                        json={"student_refs": ["stu002", "STU003"]}).json()
    assert again["already_enrolled"] == ["STU002"] and again["enrolled"] == ["STU003"]

    # The student now sees the course; the instructor sees the students
    student = login("stu003@gapmap.test")
    assert course["id"] in {c["id"] for c in client.get("/api/courses", headers=student).json()}
    listed = client.get(f"/api/courses/{course['id']}/students", headers=headers).json()
    assert [s["student_ref"] for s in listed] == ["STU001", "STU002", "STU003"]
    assert "course.students_enrolled" in set(db.scalars(select(AuditLog.action)))


def test_a_student_without_results_can_be_removed(client, login, fresh):
    headers = login(INSTRUCTOR)
    course = _new_course(client, headers)
    students = client.post(f"/api/courses/{course['id']}/enrollments", headers=headers,
                           json={"student_refs": ["STU004"]}).json()["students"]
    res = client.delete(f"/api/courses/{course['id']}/enrollments/{students[0]['id']}", headers=headers)
    assert res.status_code == 204
    assert client.get(f"/api/courses/{course['id']}/students", headers=headers).json() == []
    again = client.delete(f"/api/courses/{course['id']}/enrollments/{students[0]['id']}", headers=headers)
    assert again.status_code == 404


def test_a_student_with_results_stays_enrolled(client, login, fresh, demo):
    headers = login(INSTRUCTOR)
    stu001 = next(s for s in client.get(f"/api/courses/{demo['course_id']}/students", headers=headers).json()
                  if s["student_ref"] == "STU001")
    res = client.delete(f"/api/courses/{demo['course_id']}/enrollments/{stu001['id']}", headers=headers)
    assert res.status_code == 409
    assert "already has results" in res.json()["detail"]


def test_only_the_course_instructor_manages_its_students(client, login, demo):
    course = demo["course_id"]
    for email in ("stu001@gapmap.test", "coordinator@gapmap.test", "instructor2@gapmap.test"):
        headers = login(email)
        assert client.get(f"/api/courses/{course}/students", headers=headers).status_code == 403, email
        res = client.post(f"/api/courses/{course}/enrollments", headers=headers, json={"student_refs": ["STU001"]})
        assert res.status_code == 403, email
