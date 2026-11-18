"""Class-level analytics for an exam (FR-30, FR-45..FR-47). Approved answers only."""

import uuid
from collections import Counter, defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Concept, Course, Exam
from app.schemas.analytics import (
    ClassAnalytics,
    ConceptStat,
    ExamRef,
    OptionCount,
    QuestionStat,
    ReteachSuggestion,
)
from app.services.exam_data import approved_submissions, question_specs, submission_concept_scores
from app.services.scoring import WEAK, normalize, score_answer

ERROR_TYPE_LABEL = {
    "conceptual": "a conceptual misunderstanding",
    "formula_application": "a formula or application error",
    "calculation": "a calculation error",
    "missing_prerequisite": "a missing prerequisite",
    "incomplete_answer": "an incomplete answer",
}


def class_analytics(db: Session, course: Course, exam: Exam | None) -> ClassAnalytics:
    exams = list(db.scalars(select(Exam).where(Exam.course_id == course.id).order_by(Exam.exam_date, Exam.title)))
    base = {
        "course_id": course.id,
        "exams": [ExamRef(id=e.id, title=e.title, status=e.status) for e in exams],
        "weak_threshold_percent": settings.weak_threshold_percent,
        "reteach_threshold_percent": settings.reteach_error_rate_percent,
    }
    submissions = approved_submissions(db, exam) if exam else []
    if not submissions:
        return ClassAnalytics(**base, exam=None, student_count=0, concepts=[], questions=[], reteach=[])

    specs = question_specs(db, exam)
    prompts = {q.id: q.prompt for q in exam.questions}
    concept_ids = {cid for q in specs for cid in q.concept_weights}
    names = {c.id: c.name for c in db.scalars(select(Concept).where(Concept.id.in_(concept_ids)))}

    chosen: dict[uuid.UUID, list[str | None]] = defaultdict(list)  # question -> every answer
    for s in submissions:
        for a in s.answers:
            chosen[a.question_id].append(a.answer_text)

    questions: list[QuestionStat] = []
    per_concept: dict[uuid.UUID, list[int]] = defaultdict(lambda: [0, 0, 0])  # responses, incorrect, questions
    for q in specs:
        answers = chosen.get(q.id, [])
        counts = Counter(normalize(a) for a in answers)
        incorrect = sum(1 for a in answers if score_answer(q, a) < q.max_score)
        options = [
            OptionCount(
                key=o["key"],
                text=o["text"],
                count=counts.get(normalize(o["key"]), 0),
                is_correct=normalize(o["key"]) == normalize(q.answer_key),
                error_type=o.get("error_type"),
            )
            for o in q.options
        ]
        wrong = [o for o in options if not o.is_correct and o.count]
        questions.append(
            QuestionStat(
                question_code=q.code,
                prompt=prompts[q.id],
                concept_names=[names[c] for c in q.concept_weights],
                responses=len(answers),
                incorrect=incorrect,
                error_rate=_pct(incorrect, len(answers)),
                options=options,
                top_wrong=max(wrong, key=lambda o: o.count) if wrong else None,
            )
        )
        for cid in q.concept_weights:
            per_concept[cid][0] += len(answers)
            per_concept[cid][1] += incorrect
            per_concept[cid][2] += 1

    weak_students: Counter = Counter()
    measured: Counter = Counter()
    for s in submissions:
        for cid, score in submission_concept_scores(specs, s).items():
            measured[cid] += 1
            weak_students[cid] += score.status == WEAK

    concepts = sorted(
        (
            ConceptStat(
                concept_id=cid,
                name=names[cid],
                question_count=n_questions,
                responses=responses,
                incorrect=incorrect,
                error_rate=_pct(incorrect, responses),
                students_measured=measured[cid],
                students_weak=weak_students[cid],
            )
            for cid, (responses, incorrect, n_questions) in per_concept.items()
        ),
        key=lambda c: (-c.error_rate, c.name),
    )

    return ClassAnalytics(
        **base,
        exam=ExamRef(id=exam.id, title=exam.title, status=exam.status),
        student_count=len(submissions),
        concepts=concepts,
        questions=questions,
        reteach=_reteach(concepts, questions),
    )


def _reteach(concepts: list[ConceptStat], questions: list[QuestionStat]) -> list[ReteachSuggestion]:
    suggestions = []
    for c in concepts:
        if c.error_rate < settings.reteach_error_rate_percent:
            continue
        evidence = [
            f"{c.error_rate:g}% of {c.responses} answers on this concept were wrong "
            f"({c.question_count} questions).",
            f"{c.students_weak} of {c.students_measured} students scored below "
            f"{settings.weak_threshold_percent:g}% on it.",
        ]
        own = [q for q in questions if c.name in q.concept_names and q.top_wrong]
        if own:
            worst = max(own, key=lambda q: q.top_wrong.count)
            o = worst.top_wrong
            line = f'Most common wrong answer: {worst.question_code}, "{o.text}" ({o.count} students)'
            tag = ERROR_TYPE_LABEL.get(o.error_type or "")
            evidence.append(line + (f", which suggests {tag}." if tag else "."))
        suggestions.append(ReteachSuggestion(concept_id=c.concept_id, name=c.name, error_rate=c.error_rate, evidence=evidence))
    return suggestions


def _pct(part: int, whole: int) -> float:
    return round(100 * part / whole, 1) if whole else 0.0
