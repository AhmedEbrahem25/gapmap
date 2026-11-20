"""FR-09, FR-10: the instructor defines concepts and approves the slides that explain them."""

from sqlalchemy import select

from app.models import AuditLog
from app.services.concepts import match_slide, terms

INSTRUCTOR = "instructor@gapmap.test"


def _concepts(client, headers, course_id):
    res = client.get(f"/api/courses/{course_id}/concepts", headers=headers)
    assert res.status_code == 200, res.text
    return {c["name"]: c for c in res.json()}


# --- keyword matching (pure) -------------------------------------------------------------------


def test_terms_drop_stopwords_and_plurals():
    assert terms("The three Scrum accountabilities and roles") == ["scrum", "accountability", "role"]
    assert terms("وكيل المنتج والمطور") == ["وكيل", "المنتج", "والمطور"]  # Arabic words survive


def test_match_weights_name_over_description_and_explains_itself():
    m = match_slide("Scrum Roles", "Product Owner and Developers", "The Product Owner", "Owns the backlog")
    assert m.terms == ["product", "owner"]
    assert m.score == 4  # two description words, each doubled for being in the title
    assert match_slide("Scrum Roles", None, "Scrum events", "Sprint").score == 6  # name word in the title
    assert match_slide("Agile", None, "Requirements", "Functional requirements").terms == []


# --- reading ------------------------------------------------------------------------------------


def test_instructor_sees_concepts_with_approved_slides_and_question_counts(client, login, demo):
    concepts = _concepts(client, login(INSTRUCTOR), demo["course_id"])
    assert set(concepts) == {"Agile", "Scrum Roles", "Requirements"}
    scrum = concepts["Scrum Roles"]
    assert scrum["question_count"] == 3
    assert [s["page_number"] for s in scrum["slides"]] == [5, 6, 7, 8]


def test_suggestions_rank_matching_slides_first_and_skip_approved_ones(client, login, demo):
    headers = login(INSTRUCTOR)
    scrum = _concepts(client, headers, demo["course_id"])["Scrum Roles"]
    res = client.get(f"/api/concepts/{scrum['id']}/slide-suggestions", headers=headers)
    assert res.status_code == 200
    suggestions = res.json()
    pages = [s["slide"]["page_number"] for s in suggestions]
    assert not {5, 6, 7, 8} & set(pages)  # already approved
    assert len(pages) == demo["slides"] - 4  # every other page can still be picked
    scores = [s["score"] for s in suggestions]
    assert scores == sorted(scores, reverse=True)
    assert suggestions[0]["score"] > 0 and suggestions[0]["matched_terms"]


# --- writing ------------------------------------------------------------------------------------


def test_create_rename_map_and_unmap_a_concept(client, login, fresh, demo, db):
    headers = login(INSTRUCTOR)
    res = client.post(
        f"/api/courses/{demo['course_id']}/concepts",
        headers=headers,
        json={"name": "  Sprint   Events ", "description": "Sprint planning, daily scrum, review"},
    )
    assert res.status_code == 201, res.text
    concept = res.json()
    assert concept["name"] == "Sprint Events"
    assert concept["slides"] == [] and concept["question_count"] == 0

    res = client.put(f"/api/concepts/{concept['id']}", headers=headers, json={"name": "Scrum Events"})
    assert res.status_code == 200 and res.json()["name"] == "Scrum Events"

    best = client.get(f"/api/concepts/{concept['id']}/slide-suggestions", headers=headers).json()[0]["slide"]
    res = client.put(f"/api/concepts/{concept['id']}/slides/{best['slide_chunk_id']}", headers=headers)
    assert res.status_code == 200
    assert [s["slide_chunk_id"] for s in res.json()["slides"]] == [best["slide_chunk_id"]]
    # Approving twice changes nothing
    again = client.put(f"/api/concepts/{concept['id']}/slides/{best['slide_chunk_id']}", headers=headers)
    assert len(again.json()["slides"]) == 1

    res = client.delete(f"/api/concepts/{concept['id']}/slides/{best['slide_chunk_id']}", headers=headers)
    assert res.status_code == 200 and res.json()["slides"] == []

    assert client.delete(f"/api/concepts/{concept['id']}", headers=headers).status_code == 204
    assert "Scrum Events" not in _concepts(client, headers, demo["course_id"])

    actions = list(db.scalars(select(AuditLog.action).where(AuditLog.course_id == demo["course_id"])))
    for verb in ("created", "updated", "slide_approved", "slide_removed", "deleted"):
        assert f"concept.{verb}" in actions


def test_duplicate_names_are_refused_case_insensitively(client, login, fresh, demo):
    headers = login(INSTRUCTOR)
    res = client.post(f"/api/courses/{demo['course_id']}/concepts", headers=headers, json={"name": "scrum roles"})
    assert res.status_code == 409
    assert "already has a concept" in res.json()["detail"]
    blank = client.post(f"/api/courses/{demo['course_id']}/concepts", headers=headers, json={"name": "   "})
    assert blank.status_code == 409


def test_a_concept_in_use_cannot_be_deleted(client, login, fresh, demo):
    headers = login(INSTRUCTOR)
    agile = _concepts(client, headers, demo["course_id"])["Agile"]
    res = client.delete(f"/api/concepts/{agile['id']}", headers=headers)
    assert res.status_code == 409
    assert "3 exam questions" in res.json()["detail"]


def test_removing_a_slide_changes_what_the_student_report_shows(client, login, fresh, demo):
    """Reports read approved mappings live, so the instructor's change reaches students (BR-04)."""
    headers = login(INSTRUCTOR)
    client.post(f"/api/exams/{demo['exam_id']}/analyze", headers=headers)
    student = login("stu001@gapmap.test")

    def scrum_pages():
        report = client.get(f"/api/students/me/reports/{demo['exam_id']}", headers=student).json()
        return [s["page_number"] for c in report["concepts"] if c["name"] == "Scrum Roles" for s in c["slides"]]

    before = scrum_pages()
    assert 7 in before
    scrum = _concepts(client, headers, demo["course_id"])["Scrum Roles"]
    page7 = next(s for s in scrum["slides"] if s["page_number"] == 7)
    client.delete(f"/api/concepts/{scrum['id']}/slides/{page7['slide_chunk_id']}", headers=headers)
    assert 7 not in scrum_pages()


def test_a_slide_from_another_course_is_refused(client, login, fresh, demo):
    headers = login(INSTRUCTOR)
    concepts = _concepts(client, headers, demo["course_id"])
    agile_slide = concepts["Agile"]["slides"][0]["slide_chunk_id"]
    other = login("instructor2@gapmap.test")
    res = client.post(f"/api/courses/{demo['other_course_id']}/concepts", headers=other, json={"name": "Testing"})
    assert res.status_code == 201
    res = client.put(f"/api/concepts/{res.json()['id']}/slides/{agile_slide}", headers=other)
    assert res.status_code == 404
    assert "not in this course" in res.json()["detail"]


# --- permissions --------------------------------------------------------------------------------


def test_only_the_course_instructor_manages_concepts(client, login, demo):
    course = demo["course_id"]
    agile = _concepts(client, login(INSTRUCTOR), course)["Agile"]
    for email in ("stu001@gapmap.test", "coordinator@gapmap.test", "instructor2@gapmap.test"):
        headers = login(email)
        assert client.get(f"/api/courses/{course}/concepts", headers=headers).status_code == 403, email
        assert client.post(f"/api/courses/{course}/concepts", headers=headers, json={"name": "X"}).status_code == 403
        assert client.put(f"/api/concepts/{agile['id']}", headers=headers, json={"name": "X"}).status_code == 403
        assert client.get(f"/api/concepts/{agile['id']}/slide-suggestions", headers=headers).status_code == 403
    assert client.get(f"/api/courses/{course}/concepts", headers=login("admin@gapmap.test")).status_code == 200
