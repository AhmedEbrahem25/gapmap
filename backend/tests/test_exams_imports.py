import uuid

from sqlalchemy import func, select

from app.core.config import settings
from app.models import Answer, AuditLog, Concept, Submission
from app.seed.generate_results import RESULTS_FILENAME

INSTRUCTOR = "instructor@gapmap.test"


def _csv(*lines: str) -> bytes:
    return ("student_ref,question_id,answer,score\n" + "\n".join(lines) + "\n").encode()


def _upload(client, headers, exam_id, data: bytes, name="results.csv"):
    return client.post(f"/api/exams/{exam_id}/imports", files={"file": (name, data, "text/csv")}, headers=headers)


def _sample() -> bytes:
    return (settings.data_dir / "sample" / RESULTS_FILENAME).read_bytes()


# --- the live demo path: seed --no-results, then upload the sample CSV -------------------------


def test_tc05_tc09_sample_csv_imports_and_approves(client, login, fresh_no_results, demo, db):
    headers = login(INSTRUCTOR)
    res = _upload(client, headers, demo["exam_id"], _sample())
    assert res.status_code == 201, res.text
    batch = res.json()
    assert batch["status"] == "pending_review"
    assert batch["total_rows"] == 180 and batch["invalid_rows"] == 0 and batch["students"] == 20

    # Nothing is official before approval (FR-23)
    assert db.scalar(select(func.count()).select_from(Submission)) == 0
    assert client.post(f"/api/exams/{demo['exam_id']}/analyze", headers=headers).status_code == 409

    approved = client.post(f"/api/imports/{batch['id']}/approve", headers=headers)
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Answer)) == 180
    assert db.scalar(select(AuditLog).where(AuditLog.action == "import.approved")) is not None  # TC-26

    # The rest of the journey works on imported data
    assert client.post(f"/api/exams/{demo['exam_id']}/analyze", headers=headers).status_code == 200


def test_tc06_missing_column_rejects_the_file(client, login, fresh_no_results, demo):
    res = _upload(client, login(INSTRUCTOR), demo["exam_id"], b"question_id,answer\nQ1,B\n")
    assert res.status_code == 400
    assert "student_ref" in res.json()["detail"]


def test_invalid_rows_block_approval_until_corrected(client, login, fresh_no_results, demo):
    headers = login(INSTRUCTOR)
    batch = _upload(
        client, headers, demo["exam_id"],
        _csv("STU001,Q1,B,1", "STU001,Q99,A,0", "STU002,Q1,E,0", "STU001,Q1,B,1", "STU003,Q4,A,1"),
    ).json()
    rows = {r["row_number"]: r for r in batch["rows"]}
    assert batch["invalid_rows"] == 3
    assert "Unknown question" in rows[3]["errors"][0]  # TC-07
    assert "not an option" in rows[4]["errors"][0]  # TC-21
    assert "Duplicate" in rows[5]["errors"][0]  # TC-08
    assert "differs from the answer key" in rows[6]["warnings"][0]  # TC-22: warning only
    assert rows[6]["score"] == 1.0  # official score kept

    blocked = client.post(f"/api/imports/{batch['id']}/approve", headers=headers)
    assert blocked.status_code == 409 and "3 invalid row" in blocked.json()["detail"]

    fixed = client.patch(f"/api/imports/{batch['id']}/rows/{rows[3]['id']}", json={"question_code": "q2"}, headers=headers)
    assert fixed.json()["invalid_rows"] == 2
    fixed_row = next(r for r in fixed.json()["rows"] if r["row_number"] == 3)
    assert fixed_row["status"] == "corrected" and fixed_row["question_code"] == "Q2"

    client.patch(f"/api/imports/{batch['id']}/rows/{rows[4]['id']}", json={"answer": "c"}, headers=headers)
    after_delete = client.delete(f"/api/imports/{batch['id']}/rows/{rows[5]['id']}", headers=headers).json()
    assert after_delete["invalid_rows"] == 0 and after_delete["total_rows"] == 4

    assert client.post(f"/api/imports/{batch['id']}/approve", headers=headers).status_code == 200


def test_a_bad_score_stays_an_error_after_other_edits(client, login, fresh_no_results, demo):
    headers = login(INSTRUCTOR)
    batch = _upload(client, headers, demo["exam_id"], _csv("STU001,Q1,B,abc", "STU002,Q99,B,1")).json()
    other = next(r for r in batch["rows"] if r["row_number"] == 3)
    after = client.patch(f"/api/imports/{batch['id']}/rows/{other['id']}", json={"question_code": "Q1"}, headers=headers)
    bad = next(r for r in after.json()["rows"] if r["row_number"] == 2)
    assert "not a number" in bad["errors"][0]


def test_row_edits_are_audited(client, login, fresh_no_results, demo, db):
    headers = login(INSTRUCTOR)
    batch = _upload(client, headers, demo["exam_id"], _csv("STU001,Q1,E,0")).json()
    client.patch(f"/api/imports/{batch['id']}/rows/{batch['rows'][0]['id']}", json={"answer": "B", "score": 1}, headers=headers)
    log = db.scalar(select(AuditLog).where(AuditLog.action == "import.row_corrected"))
    assert log.details["before"]["answer"] == "E" and log.details["after"]["answer"] == "B"


def test_reject_and_no_changes_after_decision(client, login, fresh_no_results, demo):
    headers = login(INSTRUCTOR)
    batch = _upload(client, headers, demo["exam_id"], _csv("STU001,Q1,B,1")).json()
    assert client.post(f"/api/imports/{batch['id']}/reject", headers=headers).json()["status"] == "rejected"
    assert client.post(f"/api/imports/{batch['id']}/approve", headers=headers).status_code == 409
    row_id = batch["rows"][0]["id"]
    assert client.patch(f"/api/imports/{batch['id']}/rows/{row_id}", json={"answer": "A"}, headers=headers).status_code == 409


def test_new_approved_import_replaces_earlier_results_and_requires_reanalysis(client, login, fresh, demo, db):
    headers = login(INSTRUCTOR)
    client.post(f"/api/exams/{demo['exam_id']}/analyze", headers=headers)
    batch = _upload(client, headers, demo["exam_id"], _csv("STU001,Q1,B,1")).json()
    res = client.post(f"/api/imports/{batch['id']}/approve", headers=headers)
    assert res.status_code == 200
    db.expire_all()
    new_subs = db.scalar(
        select(func.count()).select_from(Submission).where(Submission.import_batch_id == uuid.UUID(batch["id"]))
    )
    assert new_subs == 1
    assert db.scalar(select(func.count()).select_from(Submission)) == 20  # replaced, not duplicated
    exams = client.get(f"/api/courses/{demo['course_id']}/exams", headers=headers).json()
    assert exams[0]["status"] == "key_approved"


def test_only_the_course_instructor_can_import(client, login, demo):
    for who in ("stu001@gapmap.test", "instructor2@gapmap.test", "coordinator@gapmap.test"):
        assert _upload(client, login(who), demo["exam_id"], _csv("STU001,Q1,B,1")).status_code == 403


# --- exam builder ------------------------------------------------------------------------------


def _question(concept_id, code="Q1", key="B"):
    return {
        "question_code": code,
        "prompt": "Which role orders the Product Backlog?",
        "options": [
            {"key": "A", "text": "Scrum Master", "error_type": "conceptual"},
            {"key": "B", "text": "Product Owner", "error_type": "conceptual"},
            {"key": "C", "text": "Developers"},
        ],
        "answer_key": key,
        "max_score": 1,
        "concept_id": str(concept_id),
    }


def test_build_an_exam_then_import_results(client, login, fresh, demo, db):
    headers = login(INSTRUCTOR)
    concept = db.scalar(select(Concept).where(Concept.name == "Scrum Roles"))
    exam = client.post(f"/api/courses/{demo['course_id']}/exams", json={"title": "Quiz 2"}, headers=headers).json()
    assert exam["status"] == "draft"

    # BR-02: no import before the key is approved
    assert _upload(client, headers, exam["id"], _csv("STU001,Q1,B,1")).status_code == 409
    assert client.post(f"/api/exams/{exam['id']}/approve-key", headers=headers).status_code == 409  # no questions

    detail = client.post(f"/api/exams/{exam['id']}/questions", json=_question(concept.id), headers=headers).json()
    q = detail["questions"][0]
    assert q["answer_key"] == "B" and q["concept_id"] == str(concept.id)
    assert next(o for o in q["options"] if o["key"] == "B")["error_type"] is None  # correct option untagged

    assert client.post(f"/api/exams/{exam['id']}/questions", json=_question(concept.id), headers=headers).status_code == 409
    bad_key = _question(concept.id, code="Q2", key="Z")
    assert client.post(f"/api/exams/{exam['id']}/questions", json=bad_key, headers=headers).status_code == 409

    approved = client.post(f"/api/exams/{exam['id']}/approve-key", headers=headers).json()
    assert approved["status"] == "key_approved" and approved["can_reopen"] is True
    assert client.put(f"/api/questions/{q['id']}", json=_question(concept.id, key="A"), headers=headers).status_code == 409

    batch = _upload(client, headers, exam["id"], _csv("STU001,Q1,B,1", "STU002,Q1,A,0")).json()
    assert batch["invalid_rows"] == 0
    client.post(f"/api/imports/{batch['id']}/approve", headers=headers)
    assert client.get(f"/api/exams/{exam['id']}", headers=headers).json()["can_reopen"] is False
    assert client.post(f"/api/exams/{exam['id']}/reopen", headers=headers).status_code == 409


def test_concept_from_another_course_is_refused(client, login, fresh, demo):
    headers = login(INSTRUCTOR)
    exam = client.post(f"/api/courses/{demo['course_id']}/exams", json={"title": "Quiz 3"}, headers=headers).json()
    res = client.post(f"/api/exams/{exam['id']}/questions", json=_question(uuid.uuid4()), headers=headers)
    assert res.status_code == 409 and "concept" in res.json()["detail"]


def test_students_cannot_see_the_answer_key(client, login, demo):
    assert client.get(f"/api/exams/{demo['exam_id']}", headers=login("stu001@gapmap.test")).status_code == 403


def test_demo_file_with_errors_has_exactly_the_planned_problems(client, login, fresh_no_results, demo):
    """data/sample/exam1_results_with_errors.csv is used to demo the review screen."""
    data = (settings.data_dir / "sample" / "exam1_results_with_errors.csv").read_bytes()
    batch = _upload(client, login(INSTRUCTOR), demo["exam_id"], data).json()
    assert batch["invalid_rows"] == 3 and batch["warning_rows"] == 1
    messages = " ".join(m for r in batch["rows"] for m in r["errors"])
    assert "not an option" in messages and "Unknown question" in messages and "Duplicate" in messages
