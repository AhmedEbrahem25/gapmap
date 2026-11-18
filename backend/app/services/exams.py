"""Exam builder: questions, options, concept links and the answer key (FR-11..FR-13)."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Concept, Exam, Question, QuestionConcept, Submission, User
from app.models.enums import ExamStatus, ImportStatus
from app.schemas.exam import ExamDetail, OptionIn, QuestionIn, QuestionOut
from app.services.audit import audit
from app.services.scoring import normalize


class ExamBlocked(Exception):
    """The change is not allowed; the message says why."""


def exam_detail(db: Session, exam: Exam) -> ExamDetail:
    questions = db.scalars(select(Question).where(Question.exam_id == exam.id).order_by(Question.position))
    return ExamDetail(
        id=exam.id,
        course_id=exam.course_id,
        title=exam.title,
        exam_date=exam.exam_date,
        status=exam.status,
        can_reopen=exam.status != ExamStatus.DRAFT and not _has_approved_results(db, exam),
        questions=[_question_out(q) for q in questions],
    )


def add_question(db: Session, exam: Exam, body: QuestionIn, user: User) -> Question:
    _require_draft(exam)
    _check(db, exam, body, existing=None)
    position = (db.scalar(select(func.max(Question.position)).where(Question.exam_id == exam.id)) or 0) + 1
    q = Question(exam_id=exam.id, position=position)
    db.add(q)
    _apply(q, body)
    db.flush()
    db.add(QuestionConcept(question_id=q.id, concept_id=body.concept_id, weight=1.0))
    audit(db, user, "question.added", q, {"code": q.question_code})
    db.commit()
    return q


def update_question(db: Session, q: Question, body: QuestionIn, user: User) -> Question:
    exam = db.get(Exam, q.exam_id)
    _require_draft(exam)
    _check(db, exam, body, existing=q)
    _apply(q, body)
    for link in list(q.concepts):
        db.delete(link)
    db.flush()
    db.add(QuestionConcept(question_id=q.id, concept_id=body.concept_id, weight=1.0))
    audit(db, user, "question.updated", q, {"code": q.question_code, "answer_key": q.answer_key})
    db.commit()
    return q


def delete_question(db: Session, q: Question, user: User) -> None:
    _require_draft(db.get(Exam, q.exam_id))
    audit(db, user, "question.deleted", q, {"code": q.question_code})
    db.delete(q)
    db.commit()


def approve_key(db: Session, exam: Exam, user: User) -> None:
    """BR-02/BR-03: results can be imported only once every question has a key and a concept."""
    _require_draft(exam)
    questions = list(db.scalars(select(Question).where(Question.exam_id == exam.id)))
    if not questions:
        raise ExamBlocked("Add at least one question before approving the answer key.")
    problems = [
        q.question_code for q in questions
        if not q.concepts or normalize(q.answer_key) not in {normalize(o["key"]) for o in q.options}
    ]
    if problems:
        raise ExamBlocked(f"These questions need an answer key and a concept: {', '.join(problems)}.")
    exam.status = ExamStatus.KEY_APPROVED
    audit(db, user, "exam.key_approved", exam, {"questions": len(questions)})
    db.commit()


def reopen(db: Session, exam: Exam, user: User) -> None:
    if exam.status == ExamStatus.DRAFT:
        return
    if _has_approved_results(db, exam):
        raise ExamBlocked("Results are already approved for this exam, so its questions can no longer change.")
    exam.status = ExamStatus.DRAFT
    audit(db, user, "exam.reopened", exam)
    db.commit()


def _check(db: Session, exam: Exam, body: QuestionIn, existing: Question | None) -> None:
    keys = [normalize(o.key) for o in body.options]
    if len(set(keys)) != len(keys):
        raise ExamBlocked("Each option needs a different key.")
    if normalize(body.answer_key) not in keys:
        raise ExamBlocked("The answer key must be one of the options.")
    clash = db.scalar(
        select(Question.id).where(
            Question.exam_id == exam.id,
            func.lower(Question.question_code) == body.question_code.strip().lower(),
            *([Question.id != existing.id] if existing else []),
        )
    )
    if clash:
        raise ExamBlocked(f"{body.question_code} already exists in this exam.")
    concept = db.get(Concept, body.concept_id)
    if concept is None or concept.course_id != exam.course_id:
        raise ExamBlocked("Choose a concept from this course.")


def _apply(q: Question, body: QuestionIn) -> None:
    key = normalize(body.answer_key)
    q.question_code = body.question_code.strip()
    q.prompt = body.prompt.strip()
    q.max_score = body.max_score
    q.options = [
        {
            "key": o.key.strip(),
            "text": o.text.strip(),
            # The correct option never carries an error tag.
            "error_type": None if normalize(o.key) == key else (o.error_type.value if o.error_type else None),
        }
        for o in body.options
    ]
    q.answer_key = next(o["key"] for o in q.options if normalize(o["key"]) == key)


def _question_out(q: Question) -> QuestionOut:
    return QuestionOut(
        id=q.id,
        question_code=q.question_code,
        position=q.position,
        prompt=q.prompt,
        options=[OptionIn(**o) for o in q.options],
        answer_key=q.answer_key,
        max_score=q.max_score,
        concept_id=q.concepts[0].concept_id if q.concepts else None,
    )


def _require_draft(exam: Exam) -> None:
    if exam.status != ExamStatus.DRAFT:
        raise ExamBlocked("The answer key is approved. Reopen the exam to change its questions.")


def _has_approved_results(db: Session, exam: Exam) -> bool:
    return (
        db.scalar(
            select(Submission.id)
            .where(Submission.exam_id == exam.id, Submission.approval_status == ImportStatus.APPROVED)
            .limit(1)
        )
        is not None
    )
