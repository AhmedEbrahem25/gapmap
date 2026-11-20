"""FR-39, BR-10, BR-11: the instructor reviews and maintains the practice and retest question bank."""

from sqlalchemy import select

from app.models import AuditLog

INSTRUCTOR = "instructor@gapmap.test"
STUDENT = "stu001@gapmap.test"


def _concept(client, headers, course_id, name):
    concepts = client.get(f"/api/courses/{course_id}/concepts", headers=headers).json()
    return next(c for c in concepts if c["name"] == name)


def _bank(client, headers, concept_id):
    res = client.get(f"/api/concepts/{concept_id}/bank-questions", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _item(**overrides):
    body = {
        "usage": "practice",
        "prompt": "Who removes impediments for a Scrum Team?",
        "options": [{"key": "A", "text": "The Product Owner"}, {"key": "B", "text": "The Scrum Master"}],
        "answer_key": "B",
    }
    return body | overrides


def _practice_prompts(client, headers, concept_id):
    res = client.get(f"/api/concepts/{concept_id}/practice", headers=headers)
    return [q["prompt"] for q in res.json()]


def test_overview_shows_every_item_with_keys_review_state_and_counts(client, login, demo):
    headers = login(INSTRUCTOR)
    scrum = _concept(client, headers, demo["course_id"], "Scrum Roles")
    assert (scrum["practice_count"], scrum["retest_count"], scrum["pending_count"]) == (3, 3, 1)

    bank = _bank(client, headers, scrum["id"])
    assert bank["concept_name"] == "Scrum Roles" and bank["retest_questions_per_concept"] == 3
    assert [s["page_number"] for s in bank["slides"]] == [5, 6, 7, 8]
    items = bank["items"]
    assert len(items) == 7
    pending = [i for i in items if i["review_status"] == "pending"]
    assert len(pending) == 1 and pending[0]["origin"] == "ai"
    assert all(i["answer_key"] and i["source"] for i in items)


def test_an_added_item_is_approved_and_served_to_students(client, login, fresh, demo, db):
    headers = login(INSTRUCTOR)
    student = login(STUDENT)
    scrum = _concept(client, headers, demo["course_id"], "Scrum Roles")
    page7 = _bank(client, headers, scrum["id"])["slides"][2]

    res = client.post(
        f"/api/concepts/{scrum['id']}/bank-questions", headers=headers,
        json=_item(prompt="  Who removes   impediments for a Scrum Team? ", answer_key="b",
                   source_chunk_id=page7["slide_chunk_id"]),
    )
    assert res.status_code == 201, res.text
    added = next(i for i in res.json()["items"] if i["prompt"] == "Who removes impediments for a Scrum Team?")
    assert added["review_status"] == "approved" and added["origin"] == "instructor"
    assert added["answer_key"] == "B" and added["source"]["page_number"] == 7
    assert added["prompt"] in _practice_prompts(client, student, scrum["id"])

    actions = set(db.scalars(select(AuditLog.action).where(AuditLog.course_id == demo["course_id"])))
    assert "bank.added" in actions


def test_invalid_items_are_refused_with_a_reason(client, login, fresh, demo):
    headers = login(INSTRUCTOR)
    scrum = _concept(client, headers, demo["course_id"], "Scrum Roles")
    exam_prompt = client.get(f"/api/exams/{demo['exam_id']}", headers=headers).json()["questions"][3]["prompt"]
    existing = next(i for i in _bank(client, headers, scrum["id"])["items"] if i["usage"] == "retest")["prompt"]
    agile_slide = _concept(client, headers, demo["course_id"], "Agile")["slides"][0]["slide_chunk_id"]

    cases = [
        (_item(answer_key="C"), "not one of the options"),
        (_item(options=[{"key": "A", "text": "x"}, {"key": "a", "text": "y"}], answer_key="A"), "its own letter"),
        (_item(prompt=exam_prompt), "already on an exam"),  # BR-10
        (_item(prompt=existing.upper()), "retest items"),  # BR-10, case-insensitive
    ]
    for body, message in cases:
        res = client.post(f"/api/concepts/{scrum['id']}/bank-questions", headers=headers, json=body)
        assert res.status_code == 409, body
        assert message in res.json()["detail"]

    # A slide from another course
    other = login("instructor2@gapmap.test")
    res = client.post(f"/api/courses/{demo['other_course_id']}/concepts", headers=other, json={"name": "Testing"})
    res = client.post(f"/api/concepts/{res.json()['id']}/bank-questions", headers=other,
                      json=_item(source_chunk_id=agile_slide))
    assert res.status_code == 409 and "not in this course" in res.json()["detail"]


def test_approving_an_ai_draft_serves_it_and_withdrawing_stops_it(client, login, fresh, demo):
    headers = login(INSTRUCTOR)
    student = login(STUDENT)
    scrum = _concept(client, headers, demo["course_id"], "Scrum Roles")
    draft = next(i for i in _bank(client, headers, scrum["id"])["items"] if i["review_status"] == "pending")
    assert draft["prompt"] not in _practice_prompts(client, student, scrum["id"])  # TC-25

    res = client.post(f"/api/bank-questions/{draft['id']}/approve", headers=headers)
    assert res.status_code == 200
    assert draft["prompt"] in _practice_prompts(client, student, scrum["id"])

    res = client.post(f"/api/bank-questions/{draft['id']}/withdraw", headers=headers)
    assert next(i for i in res.json()["items"] if i["id"] == draft["id"])["review_status"] == "pending"
    assert draft["prompt"] not in _practice_prompts(client, student, scrum["id"])


def test_edit_and_delete_an_unused_item(client, login, fresh, demo):
    headers = login(INSTRUCTOR)
    scrum = _concept(client, headers, demo["course_id"], "Scrum Roles")
    items = client.post(f"/api/concepts/{scrum['id']}/bank-questions", headers=headers, json=_item()).json()["items"]
    item = next(i for i in items if i["prompt"] == _item()["prompt"])

    res = client.put(f"/api/bank-questions/{item['id']}", headers=headers,
                     json=_item(usage="retest", prompt="Who coaches the team in self-management?"))
    assert res.status_code == 200
    edited = next(i for i in res.json()["items"] if i["id"] == item["id"])
    assert edited["usage"] == "retest" and edited["prompt"] == "Who coaches the team in self-management?"

    res = client.delete(f"/api/bank-questions/{item['id']}", headers=headers)
    assert res.status_code == 200
    assert item["id"] not in {i["id"] for i in res.json()["items"]}


def test_an_item_a_retest_used_is_frozen_but_can_be_withdrawn(client, login, fresh, demo):
    headers = login(INSTRUCTOR)
    client.post(f"/api/exams/{demo['exam_id']}/analyze", headers=headers)
    student = login(STUDENT)
    plan_id = client.get(f"/api/students/me/reports/{demo['exam_id']}", headers=student).json()["recovery_plan_id"]
    retest = client.post("/api/retests", headers=student, json={"recovery_plan_id": plan_id}).json()
    used = retest["questions"][0]

    concepts = client.get(f"/api/courses/{demo['course_id']}/concepts", headers=headers).json()
    concept = next(c for c in concepts if c["id"] == used["concept_id"])
    item = next(i for i in _bank(client, headers, concept["id"])["items"] if i["id"] == used["id"])
    assert item["used_in_retests"] == 1

    res = client.put(f"/api/bank-questions/{item['id']}", headers=headers, json=_item(usage="retest"))
    assert res.status_code == 409 and "Withdraw it instead" in res.json()["detail"]
    assert client.delete(f"/api/bank-questions/{item['id']}", headers=headers).status_code == 409
    assert client.post(f"/api/bank-questions/{item['id']}/withdraw", headers=headers).status_code == 200


def test_only_the_course_instructor_manages_the_bank(client, login, demo):
    headers = login(INSTRUCTOR)
    scrum = _concept(client, headers, demo["course_id"], "Scrum Roles")
    item = _bank(client, headers, scrum["id"])["items"][0]
    for email in (STUDENT, "coordinator@gapmap.test", "instructor2@gapmap.test"):
        h = login(email)
        assert client.get(f"/api/concepts/{scrum['id']}/bank-questions", headers=h).status_code == 403, email
        assert client.post(f"/api/concepts/{scrum['id']}/bank-questions", headers=h, json=_item()).status_code == 403
        assert client.post(f"/api/bank-questions/{item['id']}/approve", headers=h).status_code == 403
        assert client.delete(f"/api/bank-questions/{item['id']}", headers=h).status_code == 403
