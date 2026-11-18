"""Pure scoring rules (plan Section 12). No database access, so they are easy to test."""

import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from app.models.enums import ErrorType


@dataclass(frozen=True)
class QuestionSpec:
    id: uuid.UUID
    code: str
    max_score: float
    answer_key: str
    options: list[dict]
    concept_weights: Mapping[uuid.UUID, float] = field(default_factory=dict)


@dataclass(frozen=True)
class ConceptScore:
    concept_id: uuid.UUID
    earned: float
    max: float
    question_count: int
    status: str  # "weak" | "ok" | "not_enough_data"

    @property
    def percent(self) -> float:
        return round(100 * self.earned / self.max, 1) if self.max else 0.0


WEAK = "weak"
OK = "ok"
NOT_ENOUGH_DATA = "not_enough_data"


def normalize(value: str | None) -> str:
    """Case- and whitespace-insensitive comparison form."""
    return " ".join((value or "").split()).casefold()


def option_text(options: list[dict], key: str | None) -> str | None:
    if not normalize(key):
        return None
    return next((o["text"] for o in options if normalize(o.get("key")) == normalize(key)), None)


def score_answer(question: QuestionSpec, answer: str | None) -> float:
    return question.max_score if normalize(answer) and normalize(answer) == normalize(question.answer_key) else 0.0


def concept_scores(
    questions: Iterable[QuestionSpec],
    answers: Mapping[uuid.UUID, str | None],
    *,
    weak_threshold: float,
    min_questions: int,
) -> dict[uuid.UUID, ConceptScore]:
    """Per-concept performance. A question the student did not answer counts as 0.

    A concept is "weak" only when it is measured by at least `min_questions` questions;
    with fewer, a percentage can only be 0 or 100 and means little (plan Section 12).
    """
    totals: dict[uuid.UUID, list[float]] = {}  # concept -> [earned, max, count]
    for q in questions:
        score = score_answer(q, answers.get(q.id))
        for concept_id, weight in q.concept_weights.items():
            t = totals.setdefault(concept_id, [0.0, 0.0, 0])
            t[0] += score * weight
            t[1] += q.max_score * weight
            t[2] += 1

    result = {}
    for concept_id, (earned, max_, count) in totals.items():
        percent = 100 * earned / max_ if max_ else 0.0
        if count < min_questions:
            status = NOT_ENOUGH_DATA
        elif percent < weak_threshold:
            status = WEAK
        else:
            status = OK
        result[concept_id] = ConceptScore(concept_id, earned, max_, int(count), status)
    return result


def likely_cause(question: QuestionSpec, answer: str | None) -> tuple[str, str] | None:
    """The suggested error type and its evidence for a wrong answer; None when correct.

    Evidence comes from the instructor's tag on the chosen option (docs/decisions/0001,
    section 2). Without a tag the cause is "unknown" (BR-07): we never guess.
    """
    if not normalize(answer):
        return ErrorType.INCOMPLETE_ANSWER, "No answer was given for this question."
    if score_answer(question, answer) == question.max_score:
        return None
    option = next((o for o in question.options if normalize(o.get("key")) == normalize(answer)), None)
    if option is None:
        return ErrorType.UNKNOWN, f'The answer "{answer}" is not one of the options.'
    chosen = f'Chose {option["key"]}: "{option["text"]}".'
    if option.get("error_type"):
        label = option["error_type"].replace("_", " ")
        return option["error_type"], f"{chosen} The instructor marked this option as a typical {label} error."
    return ErrorType.UNKNOWN, f"{chosen} This choice alone does not show why it was picked."
