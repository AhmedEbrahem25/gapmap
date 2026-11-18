"""Shared reads of an exam's questions and approved submissions."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models import Exam, Question, Submission
from app.models.enums import ImportStatus
from app.services.scoring import ConceptScore, QuestionSpec, concept_scores


def question_specs(db: Session, exam: Exam) -> list[QuestionSpec]:
    questions = db.scalars(
        select(Question)
        .where(Question.exam_id == exam.id)
        .order_by(Question.position)
        .options(selectinload(Question.concepts))
    )
    return [
        QuestionSpec(
            id=q.id,
            code=q.question_code,
            max_score=q.max_score,
            answer_key=q.answer_key or "",
            options=q.options,
            concept_weights={qc.concept_id: qc.weight for qc in q.concepts},
        )
        for q in questions
    ]


def approved_submissions(db: Session, exam: Exam) -> list[Submission]:
    """Analysis only ever reads approved data (FR-23)."""
    return list(
        db.scalars(
            select(Submission)
            .where(Submission.exam_id == exam.id, Submission.approval_status == ImportStatus.APPROVED)
            .options(selectinload(Submission.answers))
        )
    )


def student_submission(db: Session, exam: Exam, student_id: uuid.UUID) -> Submission | None:
    return db.scalar(
        select(Submission)
        .where(
            Submission.exam_id == exam.id,
            Submission.student_id == student_id,
            Submission.approval_status == ImportStatus.APPROVED,
        )
        .options(selectinload(Submission.answers))
    )


def submission_concept_scores(specs: list[QuestionSpec], submission: Submission) -> dict[uuid.UUID, ConceptScore]:
    return concept_scores(
        specs,
        {a.question_id: a.answer_text for a in submission.answers},
        weak_threshold=settings.weak_threshold_percent,
        min_questions=settings.min_questions_per_concept,
    )
