import uuid

from app.services.scoring import (
    NOT_ENOUGH_DATA,
    OK,
    WEAK,
    QuestionSpec,
    concept_scores,
    likely_cause,
    normalize,
    score_answer,
)

A, B = uuid.uuid4(), uuid.uuid4()
OPTIONS = [
    {"key": "A", "text": "Wrong, tagged", "error_type": "conceptual"},
    {"key": "B", "text": "Right", "error_type": None},
    {"key": "C", "text": "Wrong, untagged", "error_type": None},
]


def q(concepts: dict, key: str = "B", max_score: float = 1.0) -> QuestionSpec:
    return QuestionSpec(uuid.uuid4(), "Q", max_score, key, OPTIONS, concepts)


def test_normalize_ignores_case_and_whitespace():
    assert normalize("  b ") == normalize("B")
    assert normalize("Product   Owner") == normalize("product owner")
    assert normalize(None) == ""


def test_score_answer_exact_match_only():
    question = q({A: 1.0}, max_score=2.0)
    assert score_answer(question, " b") == 2.0
    assert score_answer(question, "C") == 0.0
    assert score_answer(question, "") == 0.0
    assert score_answer(question, None) == 0.0


def test_concept_scores_weak_ok_and_unanswered_counts_as_zero():
    q1, q2, q3 = q({A: 1.0}), q({A: 1.0}), q({A: 1.0})
    q4, q5 = q({B: 1.0}), q({B: 1.0})
    scores = concept_scores(
        [q1, q2, q3, q4, q5],
        {q1.id: "B", q2.id: "C", q4.id: "B", q5.id: "B"},  # q3 unanswered
        weak_threshold=60,
        min_questions=2,
    )
    assert scores[A].percent == 33.3 and scores[A].status == WEAK and scores[A].question_count == 3
    assert scores[B].percent == 100.0 and scores[B].status == OK


def test_tc23_single_question_concept_is_not_enough_data():
    only = q({A: 1.0})
    scores = concept_scores([only], {only.id: "C"}, weak_threshold=60, min_questions=2)
    assert scores[A].percent == 0.0
    assert scores[A].status == NOT_ENOUGH_DATA  # never "weak" on one question


def test_threshold_boundary_is_not_weak():
    q1, q2, q3, q4, q5 = (q({A: 1.0}) for _ in range(5))
    answers = {q1.id: "B", q2.id: "B", q3.id: "B", q4.id: "C", q5.id: "C"}  # exactly 60%
    assert concept_scores([q1, q2, q3, q4, q5], answers, weak_threshold=60, min_questions=2)[A].status == OK


def test_weighted_concepts():
    shared = q({A: 0.5, B: 0.5}, max_score=2.0)
    scores = concept_scores([shared], {shared.id: "B"}, weak_threshold=60, min_questions=1)
    assert scores[A].earned == 1.0 and scores[A].max == 1.0


def test_likely_cause_uses_the_instructor_tag():
    error_type, evidence = likely_cause(q({A: 1.0}), "A")
    assert error_type == "conceptual"
    assert 'Chose A: "Wrong, tagged"' in evidence


def test_likely_cause_untagged_is_unknown():
    assert likely_cause(q({A: 1.0}), "C")[0] == "unknown"


def test_likely_cause_blank_is_incomplete_and_correct_is_none():
    assert likely_cause(q({A: 1.0}), "  ")[0] == "incomplete_answer"
    assert likely_cause(q({A: 1.0}), "b") is None
