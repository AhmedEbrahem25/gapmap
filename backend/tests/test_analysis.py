from sqlalchemy import delete, func, select

from app.models import Answer, AuditLog, Concept, ConceptSlideChunk, Diagnosis, ImportBatch, User
from app.models.enums import ImportStatus

INSTRUCTOR = "instructor@gapmap.test"


def _analyze(client, login, exam_id, who=INSTRUCTOR):
    return client.post(f"/api/exams/{exam_id}/analyze", headers=login(who))


def _concepts(report):
    return {c["name"]: c for c in report["concepts"]}


def test_tc10_analysis_scores_stu001_per_concept(client, login, fresh, demo, db):
    official_before = sorted(db.scalars(select(Answer.official_score)).all())

    res = _analyze(client, login, demo["exam_id"])
    assert res.status_code == 200, res.text
    summary = res.json()
    assert summary["students"] == 20 and summary["answers"] == 180
    assert summary["score_mismatches"] == 0

    report = client.get(f"/api/students/me/reports/{demo['exam_id']}", headers=login("stu001@gapmap.test")).json()
    concepts = _concepts(report)
    assert concepts["Agile"]["percent"] == 33.3 and concepts["Agile"]["status"] == "weak"
    assert concepts["Scrum Roles"]["percent"] == 33.3 and concepts["Scrum Roles"]["status"] == "weak"
    assert concepts["Requirements"]["percent"] == 100.0 and concepts["Requirements"]["status"] == "ok"
    assert all(c["question_count"] == 3 for c in concepts.values())
    assert report["earned"] == 5 and report["max"] == 9
    assert report["concepts"][-1]["name"] == "Requirements"  # weakest first

    # BR-01: official scores are never touched; computed scores are filled in
    db.expire_all()
    assert sorted(db.scalars(select(Answer.official_score)).all()) == official_before
    assert db.scalar(select(func.count()).where(Answer.computed_score.is_(None))) == 0
    assert db.scalar(select(AuditLog).where(AuditLog.action == "exam.analyzed")) is not None


def test_wrong_answers_get_an_evidence_backed_likely_cause(client, login, fresh, demo):
    _analyze(client, login, demo["exam_id"])
    report = client.get(f"/api/students/me/reports/{demo['exam_id']}", headers=login("stu001@gapmap.test")).json()
    by_code = {q["question_code"]: q for q in report["questions"]}
    q4 = by_code["Q4"]
    assert q4["your_answer"] == "A" and q4["correct_answer"] == "B"
    assert q4["likely_cause"] == "conceptual"
    assert "The Scrum Master" in q4["evidence"]
    assert by_code["Q3"]["likely_cause"] is None  # correct answer: no diagnosis


def test_tc11_weak_concepts_link_real_slides(client, login, fresh, demo):
    _analyze(client, login, demo["exam_id"])
    report = client.get(f"/api/students/me/reports/{demo['exam_id']}", headers=login("stu001@gapmap.test")).json()
    agile = _concepts(report)["Agile"]["slides"]
    assert [s["page_number"] for s in agile] == [2, 3, 4]
    assert all(s["filename"] == "SE_Lecture03_Agile_Scrum_Requirements.pdf" for s in agile)
    assert "Individuals and interactions" in agile[0]["excerpt"]


def test_tc12_no_approved_slide_means_no_source_not_an_invented_one(client, login, fresh, demo, db):
    scrum = db.scalar(select(Concept).where(Concept.name == "Scrum Roles"))
    db.execute(delete(ConceptSlideChunk).where(ConceptSlideChunk.concept_id == scrum.id))
    db.commit()
    _analyze(client, login, demo["exam_id"])
    report = client.get(f"/api/students/me/reports/{demo['exam_id']}", headers=login("stu001@gapmap.test")).json()
    assert _concepts(report)["Scrum Roles"]["slides"] == []


def test_tc19_analysis_blocked_without_approved_results(client, login, fresh_no_results, demo):
    res = _analyze(client, login, demo["exam_id"])
    assert res.status_code == 409
    assert "no approved results" in res.json()["detail"]


def test_tc19_analysis_blocked_while_import_pending(client, login, fresh_no_results, demo, db):
    instructor = db.scalar(select(User).where(User.email == INSTRUCTOR))
    db.add(ImportBatch(exam_id=demo["exam_id"], uploaded_by=instructor.id, status=ImportStatus.PENDING_REVIEW))
    db.commit()
    res = _analyze(client, login, demo["exam_id"])
    assert res.status_code == 409
    assert "not approved yet" in res.json()["detail"]


def test_rerunning_analysis_replaces_diagnoses(client, login, fresh, demo, db):
    _analyze(client, login, demo["exam_id"])
    first = db.scalar(select(func.count()).select_from(Diagnosis))
    _analyze(client, login, demo["exam_id"])
    assert db.scalar(select(func.count()).select_from(Diagnosis)) == first


def test_only_the_course_instructor_can_run_analysis(client, login, demo):
    for who in ("stu001@gapmap.test", "instructor2@gapmap.test", "coordinator@gapmap.test"):
        assert _analyze(client, login, demo["exam_id"], who).status_code == 403


def test_report_not_ready_before_analysis(client, login, demo):
    headers = login("stu001@gapmap.test")
    assert client.get("/api/students/me/reports", headers=headers).json() == []
    assert client.get(f"/api/students/me/reports/{demo['exam_id']}", headers=headers).status_code == 404


def test_tc02_and_tc27_student_level_reports_are_protected(client, login, fresh, demo, db):
    _analyze(client, login, demo["exam_id"])
    stu002 = db.scalar(select(User).where(User.student_ref == "STU002"))
    url = f"/api/exams/{demo['exam_id']}/students/{stu002.id}/report"

    assert client.get(url, headers=login("stu001@gapmap.test")).status_code == 403  # TC-02
    assert client.get(url, headers=login("coordinator@gapmap.test")).status_code == 403  # TC-27
    assert client.get(url, headers=login("instructor2@gapmap.test")).status_code == 403
    instructor_view = client.get(url, headers=login(INSTRUCTOR))
    assert instructor_view.status_code == 200 and instructor_view.json()["student_ref"] == "STU002"

    mine = client.get("/api/students/me/reports", headers=login("stu001@gapmap.test")).json()
    assert [r["student_ref"] for r in mine] == ["STU001"]


def test_instructor_results_list(client, login, fresh, demo):
    _analyze(client, login, demo["exam_id"])
    rows = client.get(f"/api/exams/{demo['exam_id']}/results", headers=login(INSTRUCTOR)).json()
    assert len(rows) == 20
    stu001 = next(r for r in rows if r["student_ref"] == "STU001")
    assert stu001["earned"] == 5 and stu001["weak_concepts"] == ["Agile", "Scrum Roles"]
    assert client.get(f"/api/exams/{demo['exam_id']}/results", headers=login("coordinator@gapmap.test")).status_code == 403


def test_exam_list_shows_status(client, login, demo):
    exams = client.get(f"/api/courses/{demo['course_id']}/exams", headers=login("stu001@gapmap.test")).json()
    assert exams == [
        {
            "id": str(demo["exam_id"]),
            "course_id": str(demo["course_id"]),
            "title": "Midterm Quiz 1",
            "exam_date": "2026-11-10",
            "status": "key_approved",
            "question_count": 9,
        }
    ]
