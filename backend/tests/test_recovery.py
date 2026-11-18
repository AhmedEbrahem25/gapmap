import uuid

import pytest
from sqlalchemy import select

from app.models import BankQuestion, RecoveryPlan, RetestResponse, User
from app.models.enums import BankUsage

INSTRUCTOR = "instructor@gapmap.test"
STU001 = "stu001@gapmap.test"


@pytest.fixture
def analysed(client, login, fresh, demo):
    res = client.post(f"/api/exams/{demo['exam_id']}/analyze", headers=login(INSTRUCTOR))
    assert res.status_code == 200, res.text
    return res.json()


def _my_plan(client, login, demo, who=STU001):
    headers = login(who)
    report = client.get(f"/api/students/me/reports/{demo['exam_id']}", headers=headers).json()
    return client.get(f"/api/recovery-plans/{report['recovery_plan_id']}", headers=headers).json()


def test_tc13_plan_covers_only_weak_concepts_weakest_first(client, login, demo, analysed):
    assert analysed["recovery_plans"] >= 1
    plan = _my_plan(client, login, demo)
    assert [c["name"] for c in plan["concepts"]] == ["Agile", "Scrum Roles"]  # tie at 33.3%: by name
    agile = plan["concepts"][0]
    assert agile["percent_before"] == 33.3
    kinds = [t["task_type"] for t in agile["tasks"]]
    assert kinds == ["review_slide", "review_slide", "review_slide", "practice"]
    assert [t["slide"]["page_number"] for t in agile["tasks"][:3]] == [2, 3, 4]
    assert plan["retest_question_count"] == 6


def test_student_without_weak_concepts_gets_no_plan(client, login, demo, analysed, db):
    stu002 = db.scalar(select(User).where(User.student_ref == "STU002"))
    assert db.scalar(select(RecoveryPlan).where(RecoveryPlan.student_id == stu002.id)) is None
    report = client.get(f"/api/students/me/reports/{demo['exam_id']}", headers=login("stu002@gapmap.test")).json()
    assert report["recovery_plan_id"] is None


def test_tc14_completing_a_task_is_saved(client, login, demo, analysed):
    plan = _my_plan(client, login, demo)
    task = plan["concepts"][0]["tasks"][0]
    assert client.post(f"/api/recovery-tasks/{task['id']}/complete", headers=login(STU001)).status_code == 204
    again = _my_plan(client, login, demo)
    assert again["concepts"][0]["tasks"][0]["status"] == "completed"


def test_other_students_cannot_see_or_change_a_plan(client, login, demo, analysed):
    plan = _my_plan(client, login, demo)
    task = plan["concepts"][0]["tasks"][0]
    other = login("stu003@gapmap.test")
    assert client.get(f"/api/recovery-plans/{plan['id']}", headers=other).status_code == 403
    assert client.post(f"/api/recovery-tasks/{task['id']}/complete", headers=other).status_code == 403
    assert client.post("/api/retests", json={"recovery_plan_id": plan["id"]}, headers=other).status_code == 403
    assert client.get(f"/api/recovery-plans/{plan['id']}", headers=login("coordinator@gapmap.test")).status_code == 403
    assert client.get(f"/api/recovery-plans/{plan['id']}", headers=login(INSTRUCTOR)).status_code == 200


def test_tc25_practice_serves_approved_items_only_without_keys(client, login, demo, analysed):
    plan = _my_plan(client, login, demo)
    scrum = next(c for c in plan["concepts"] if c["name"] == "Scrum Roles")
    items = client.get(f"/api/concepts/{scrum['concept_id']}/practice", headers=login(STU001)).json()
    assert len(items) == 3
    assert not any(i["prompt"].startswith("[AI draft]") for i in items)
    assert all("answer_key" not in i for i in items)


def test_practice_check_gives_feedback_with_source(client, login, demo, analysed, db):
    item = db.scalar(
        select(BankQuestion).where(BankQuestion.usage == BankUsage.PRACTICE, BankQuestion.review_status == "approved")
    )
    headers = login(STU001)
    wrong = next(o["key"] for o in item.options if o["key"] != item.answer_key)
    res = client.post(f"/api/practice/{item.id}/check", json={"answer": wrong}, headers=headers).json()
    assert res["correct"] is False and res["correct_answer"] == item.answer_key
    assert res["source"]["filename"].endswith(".pdf") and res["source"]["page_number"] >= 1
    ok = client.post(f"/api/practice/{item.id}/check", json={"answer": item.answer_key.lower()}, headers=headers)
    assert ok.json()["correct"] is True


def test_retest_items_cannot_be_checked_as_practice(client, login, demo, analysed, db):
    item = db.scalar(select(BankQuestion).where(BankQuestion.usage == BankUsage.RETEST))
    res = client.post(f"/api/practice/{item.id}/check", json={"answer": "A"}, headers=login(STU001))
    assert res.status_code == 404  # would leak the retest answer key


def test_tc15_tc24_retest_uses_retest_items_and_reports_gain(client, login, demo, analysed, db):
    plan = _my_plan(client, login, demo)
    headers = login(STU001)
    retest = client.post("/api/retests", json={"recovery_plan_id": plan["id"]}, headers=headers)
    assert retest.status_code == 201
    questions = retest.json()["questions"]
    assert len(questions) == 6
    assert all("answer_key" not in q for q in questions)

    ids = [q["id"] for q in questions]
    items = {
        str(b.id): b for b in db.scalars(select(BankQuestion).where(BankQuestion.id.in_([uuid.UUID(i) for i in ids])))
    }
    assert {b.usage for b in items.values()} == {"retest"}  # BR-10
    assert {str(b.concept_id) for b in items.values()} == {c["concept_id"] for c in plan["concepts"]}

    # Same retest comes back until it is submitted
    again = client.post("/api/retests", json={"recovery_plan_id": plan["id"]}, headers=headers).json()
    assert again["id"] == retest.json()["id"]

    # All correct on Agile, all wrong on Scrum Roles
    agile_id = plan["concepts"][0]["concept_id"]
    answers = {
        qid: (b.answer_key if str(b.concept_id) == agile_id else next(o["key"] for o in b.options if o["key"] != b.answer_key))
        for qid, b in items.items()
    }
    res = client.post(f"/api/retests/{retest.json()['id']}/submit", json={"answers": answers}, headers=headers)
    assert res.status_code == 200, res.text
    result = res.json()
    gains = {c["name"]: c for c in result["concepts"]}
    assert gains["Agile"]["before_percent"] == 33.3 and gains["Agile"]["after_percent"] == 100.0
    assert gains["Agile"]["gain_points"] == 66.7
    assert gains["Scrum Roles"]["gain_points"] == -33.3
    assert gains["Agile"]["before_question_count"] == 3 and gains["Agile"]["after_question_count"] == 3
    assert result["total_score"] == 3 and result["max_score"] == 6
    assert "not proof of mastery" in result["note"]

    db.expire_all()
    stored = db.scalars(select(RetestResponse).where(RetestResponse.retest_id == uuid.UUID(retest.json()["id"]))).all()
    assert len(stored) == 6 and all(r.score is not None for r in stored)

    # Results are readable later; a second submit is refused; the plan is completed
    assert client.get(f"/api/retests/{retest.json()['id']}/results", headers=headers).status_code == 200
    assert client.post(f"/api/retests/{retest.json()['id']}/submit", json={"answers": {}}, headers=headers).status_code == 409
    assert _my_plan(client, login, demo)["status"] == "completed"


def test_rerunning_analysis_keeps_a_plan_with_a_retest(client, login, demo, analysed):
    plan = _my_plan(client, login, demo)
    client.post("/api/retests", json={"recovery_plan_id": plan["id"]}, headers=login(STU001))
    client.post(f"/api/exams/{demo['exam_id']}/analyze", headers=login(INSTRUCTOR))
    assert _my_plan(client, login, demo)["id"] == plan["id"]


def test_rerunning_analysis_rebuilds_plans_without_retests(client, login, demo, analysed):
    first = _my_plan(client, login, demo, "stu003@gapmap.test")
    client.post(f"/api/exams/{demo['exam_id']}/analyze", headers=login(INSTRUCTOR))
    assert _my_plan(client, login, demo, "stu003@gapmap.test")["id"] != first["id"]


def test_submitting_answers_for_foreign_questions_is_refused(client, login, demo, analysed, db):
    plan = _my_plan(client, login, demo)
    headers = login(STU001)
    retest = client.post("/api/retests", json={"recovery_plan_id": plan["id"]}, headers=headers).json()
    practice = db.scalar(select(BankQuestion).where(BankQuestion.usage == BankUsage.PRACTICE))
    res = client.post(f"/api/retests/{retest['id']}/submit", json={"answers": {str(practice.id): "A"}}, headers=headers)
    assert res.status_code == 409


def test_gain_is_computed_before_rounding(client, login, demo, analysed, db):
    plan = _my_plan(client, login, demo)
    headers = login(STU001)
    retest = client.post("/api/retests", json={"recovery_plan_id": plan["id"]}, headers=headers).json()
    ids = [uuid.UUID(q["id"]) for q in retest["questions"]]
    items = list(db.scalars(select(BankQuestion).where(BankQuestion.id.in_(ids))))
    scrum_id = next(c["concept_id"] for c in plan["concepts"] if c["name"] == "Scrum Roles")
    scrum_items = [b for b in items if str(b.concept_id) == scrum_id]
    answers = {str(b.id): b.answer_key for b in scrum_items[:2]}  # 2 of 3 right
    res = client.post(f"/api/retests/{retest['id']}/submit", json={"answers": answers}, headers=headers).json()
    scrum = next(c for c in res["concepts"] if c["name"] == "Scrum Roles")
    assert scrum["after_percent"] == 66.7 and scrum["before_percent"] == 33.3
    assert scrum["gain_points"] == 33.3
