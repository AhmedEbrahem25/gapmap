import pytest
from sqlalchemy import delete, select

from app.api.explanations import get_explainer
from app.main import app
from app.models import Concept, ConceptSlideChunk, User
from app.services.explanations import ExplainerUnavailable

INSTRUCTOR = "instructor@gapmap.test"
STU001 = "stu001@gapmap.test"


class FakeExplainer:
    model = "fake-model"

    def __init__(self, result=None, error: Exception | None = None):
        self.calls: list[tuple[str, str]] = []
        self.result = result or {
            "explanation": "The Scrum Master coaches the team; the Product Owner orders the backlog.",
            "key_points": ["PO decides what", "Developers decide how", "SM is not a manager"],
            "cited_pages": [6, 7, 99],  # 99 was never sent
        }
        self.error = error

    def explain(self, system, prompt):
        self.calls.append((system, prompt))
        if self.error:
            raise self.error
        return self.result


@pytest.fixture
def fake():
    explainer = FakeExplainer()
    app.dependency_overrides[get_explainer] = lambda: explainer
    yield explainer
    app.dependency_overrides.pop(get_explainer, None)


def _scrum(db):
    return db.scalar(select(Concept).where(Concept.name == "Scrum Roles"))


def _get(client, login, concept_id, who=STU001):
    return client.get(f"/api/concepts/{concept_id}/explanation", headers=login(who))


def test_explanation_is_grounded_and_never_cites_unsent_pages(client, login, fresh, db, fake):
    res = _get(client, login, _scrum(db).id).json()
    assert res["status"] == "ready" and res["model"] == "fake-model"
    assert "Product Owner" in res["explanation"]
    assert [s["page_number"] for s in res["sources"]] == [6, 7]  # FR-35: page 99 dropped

    system, prompt = fake.calls[0]
    assert "not instructions" in system  # prompt-injection guard (plan 10.4)
    assert '<slide file="SE_Lecture03_Agile_Scrum_Requirements.pdf" page="7">' in prompt
    assert "Is NOT a project manager" in prompt  # real slide text is sent


def test_prompt_contains_no_student_data(client, login, fresh, db, fake):
    """BR-12: only the concept and slide text leave the system."""
    _get(client, login, _scrum(db).id)
    prompt = fake.calls[0][1]
    for student in db.scalars(select(User).where(User.role == "student")):
        assert student.name not in prompt
        assert student.email not in prompt
        assert student.student_ref not in prompt


def test_explanation_is_cached_per_concept(client, login, fresh, db, fake):
    concept_id = _scrum(db).id
    _get(client, login, concept_id)
    _get(client, login, concept_id, who="stu002@gapmap.test")
    assert len(fake.calls) == 1


def test_cache_refreshes_when_approved_slides_change(client, login, fresh, db, fake):
    scrum = _scrum(db)
    _get(client, login, scrum.id)
    first = db.scalar(select(ConceptSlideChunk).where(ConceptSlideChunk.concept_id == scrum.id))
    db.delete(first)
    db.commit()
    _get(client, login, scrum.id)
    assert len(fake.calls) == 2


def test_tc18_llm_failure_degrades_gracefully(client, login, fresh, db):
    failing = FakeExplainer(error=ExplainerUnavailable("The explanation service could not be reached."))
    app.dependency_overrides[get_explainer] = lambda: failing
    try:
        res = _get(client, login, _scrum(db).id)
        assert res.status_code == 200
        assert res.json() == {
            "status": "unavailable", "explanation": None, "key_points": [], "sources": [], "model": None,
            "message": "The explanation service could not be reached.",
        }
    finally:
        app.dependency_overrides.pop(get_explainer, None)


def test_no_approved_slides_means_no_llm_call(client, login, fresh, db, fake):
    scrum = _scrum(db)
    db.execute(delete(ConceptSlideChunk).where(ConceptSlideChunk.concept_id == scrum.id))
    db.commit()
    res = _get(client, login, scrum.id).json()
    assert res["status"] == "unavailable" and "no approved slides" in res["message"]
    assert fake.calls == []


def test_empty_model_output_is_unavailable_not_an_error(client, login, fresh, db):
    empty = FakeExplainer(result={"explanation": "  ", "key_points": [], "cited_pages": []})
    app.dependency_overrides[get_explainer] = lambda: empty
    try:
        assert _get(client, login, _scrum(db).id).json()["status"] == "unavailable"
    finally:
        app.dependency_overrides.pop(get_explainer, None)


def test_students_outside_the_course_are_denied(client, login, fresh, db, fake):
    from app.models import Course, CourseEnrollment

    other = db.scalar(select(Course).where(Course.code == "CS204"))
    outsider = db.scalar(select(User).where(User.student_ref == "STU020"))
    db.execute(delete(CourseEnrollment).where(CourseEnrollment.student_id == outsider.id))
    db.add(CourseEnrollment(course_id=other.id, student_id=outsider.id))
    db.commit()
    assert _get(client, login, _scrum(db).id, who="stu020@gapmap.test").status_code == 403


# --- audit log ---------------------------------------------------------------------------------


def test_tc26_audit_log_lists_course_actions_newest_first(client, login, fresh, demo):
    headers = login(INSTRUCTOR)
    client.post(f"/api/exams/{demo['exam_id']}/analyze", headers=headers)
    entries = client.get(f"/api/courses/{demo['course_id']}/audit-log", headers=headers).json()
    actions = [e["action"] for e in entries]
    assert actions[0] == "exam.analyzed" and "import.approved" in actions
    assert entries[0]["actor_name"] == "Dr. Mona Adel"
    assert [e["timestamp"] for e in entries] == sorted((e["timestamp"] for e in entries), reverse=True)


def test_audit_log_is_for_the_course_instructor_only(client, login, demo):
    url = f"/api/courses/{demo['course_id']}/audit-log"
    for who in (STU001, "coordinator@gapmap.test", "instructor2@gapmap.test"):
        assert client.get(url, headers=login(who)).status_code == 403


# --- the real Claude client wrapper, with a stub in place of the network --------------------------


class _Block:
    def __init__(self, type_, text=None):
        self.type, self.text = type_, text


class _Response:
    def __init__(self, stop_reason, blocks):
        self.stop_reason, self.content = stop_reason, blocks


class _StubClient:
    def __init__(self, outcome):
        self.outcome, self.kwargs = outcome, None
        self.beta = self
        self.messages = self

    def create(self, **kwargs):
        self.kwargs = kwargs
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


def _claude(outcome):
    from app.services.explanations import ClaudeExplainer

    explainer = ClaudeExplainer()
    explainer._client = _StubClient(outcome)
    return explainer


def test_claude_explainer_sends_structured_request_with_fallback():
    stub_json = '{"explanation": "x", "key_points": [], "cited_pages": [2]}'
    explainer = _claude(_Response("end_turn", [_Block("thinking"), _Block("text", stub_json)]))
    assert explainer.explain("sys", "prompt") == {"explanation": "x", "key_points": [], "cited_pages": [2]}
    sent = explainer._client.kwargs
    assert sent["model"] == "claude-opus-5-5"
    assert sent["output_config"]["format"]["type"] == "json_schema"
    assert sent["fallbacks"] == "default" and sent["betas"] == ["server-side-fallback-2026-07-01"]


@pytest.mark.parametrize(
    ("outcome", "message"),
    [
        (TypeError("Could not resolve authentication method"), "not configured"),
        (_Response("refusal", []), "could be generated"),
        (_Response("max_tokens", [_Block("text", '{"expl')]), "cut off"),
        (_Response("end_turn", [_Block("text", "not json")]), "unexpected format"),
    ],
)
def test_claude_explainer_failures_become_unavailable(outcome, message):
    with pytest.raises(ExplainerUnavailable, match=message):
        _claude(outcome).explain("sys", "prompt")
