import csv
from collections import Counter

from app.core.config import settings
from app.seed.generate_results import RESULTS_FILENAME

INSTRUCTOR = "instructor@gapmap.test"


def _analytics(client, login, demo, who=INSTRUCTOR, **params):
    return client.get(f"/api/courses/{demo['course_id']}/analytics", params=params, headers=login(who))


def _sample_rows():
    with (settings.data_dir / "sample" / RESULTS_FILENAME).open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_tc16_scrum_roles_has_highest_error_rate_and_is_suggested(client, login, demo):
    res = _analytics(client, login, demo)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["exam"]["title"] == "Midterm Quiz 1"
    assert data["student_count"] == 20

    concepts = data["concepts"]
    assert concepts[0]["name"] == "Scrum Roles"
    assert [c["error_rate"] for c in concepts] == sorted((c["error_rate"] for c in concepts), reverse=True)

    reteach = {s["name"]: s for s in data["reteach"]}
    assert "Scrum Roles" in reteach
    assert "Requirements" not in reteach
    evidence = " ".join(reteach["Scrum Roles"]["evidence"])
    assert "of 60 answers" in evidence and "students scored below 60%" in evidence
    assert "conceptual misunderstanding" in evidence


def test_aggregation_matches_the_sample_csv(client, login, demo):
    """Recount from the raw CSV so the numbers are checked independently of the service."""
    rows = _sample_rows()
    wrong = Counter(r["question_id"] for r in rows if r["score"] == "0")
    data = _analytics(client, login, demo).json()

    by_code = {q["question_code"]: q for q in data["questions"]}
    for code, q in by_code.items():
        assert q["responses"] == 20
        assert q["incorrect"] == wrong.get(code, 0), code
        assert sum(o["count"] for o in q["options"]) == 20

    scrum = next(c for c in data["concepts"] if c["name"] == "Scrum Roles")
    expected = wrong["Q4"] + wrong["Q5"] + wrong["Q6"]
    assert scrum["responses"] == 60 and scrum["incorrect"] == expected
    assert scrum["error_rate"] == round(100 * expected / 60, 1)


def test_top_wrong_option_is_reported_with_its_tag(client, login, demo):
    q4 = next(q for q in _analytics(client, login, demo).json()["questions"] if q["question_code"] == "Q4")
    top = q4["top_wrong"]
    assert top["is_correct"] is False
    assert top["count"] == max(o["count"] for o in q4["options"] if not o["is_correct"])


def test_coordinator_and_admin_can_see_aggregates(client, login, demo):
    for who in ("coordinator@gapmap.test", "admin@gapmap.test"):
        assert _analytics(client, login, demo, who).status_code == 200


def test_students_and_other_instructors_are_denied(client, login, demo):
    assert _analytics(client, login, demo, "stu001@gapmap.test").status_code == 403
    assert _analytics(client, login, demo, "instructor2@gapmap.test").status_code == 403


def test_no_approved_results_gives_an_empty_report(client, login, fresh_no_results, demo):
    data = _analytics(client, login, demo).json()
    assert data["exam"] is None and data["concepts"] == [] and data["reteach"] == []
    assert len(data["exams"]) == 1


def test_unknown_exam_is_404(client, login, demo):
    res = _analytics(client, login, demo, exam_id="00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404
