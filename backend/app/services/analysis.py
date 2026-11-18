"""Runs analysis on an exam's approved answers and builds student reports (FR-24..FR-30)."""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models import (
    Answer,
    Concept,
    ConceptSlideChunk,
    Course,
    Diagnosis,
    Exam,
    ImportBatch,
    Material,
    Question,
    SlideChunk,
    Submission,
    User,
)
from app.models.enums import ExamStatus, ImportStatus, MappingStatus
from app.schemas.report import ConceptReport, QuestionResult, SlideRef, StudentReport, StudentResultRow
from app.services.audit import audit
from app.services.scoring import WEAK, QuestionSpec, concept_scores, likely_cause, score_answer

EXCERPT_CHARS = 220


class AnalysisBlocked(Exception):
    """The exam is not ready for analysis; the message says what to do."""


def question_specs(db: Session, exam: Exam) -> list[QuestionSpec]:
    questions = db.scalars(
        select(Question).where(Question.exam_id == exam.id).options(selectinload(Question.concepts))
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


def run_analysis(db: Session, exam: Exam, actor: User) -> dict:
    if exam.status == ExamStatus.DRAFT:
        raise AnalysisBlocked("Approve the answer key before running analysis.")  # BR-02
    submissions = approved_submissions(db, exam)
    if not submissions:
        pending = db.scalar(
            select(ImportBatch.id).where(
                ImportBatch.exam_id == exam.id, ImportBatch.status == ImportStatus.PENDING_REVIEW
            )
        )
        if pending:
            raise AnalysisBlocked("Results are imported but not approved yet. Review and approve them first.")
        raise AnalysisBlocked("There are no approved results for this exam. Import and approve a results CSV first.")

    specs = {q.id: q for q in question_specs(db, exam)}
    answer_ids = [a.id for s in submissions for a in s.answers]
    db.execute(delete(Diagnosis).where(Diagnosis.answer_id.in_(answer_ids)))  # re-running replaces them

    mismatches = 0
    for submission in submissions:
        for answer in submission.answers:
            q = specs[answer.question_id]
            answer.computed_score = score_answer(q, answer.answer_text)  # official_score untouched (BR-01)
            if answer.official_score is not None and answer.official_score != answer.computed_score:
                mismatches += 1
            cause = likely_cause(q, answer.answer_text)
            if cause:
                error_type, evidence = cause
                db.add(Diagnosis(answer_id=answer.id, error_type=error_type, evidence=evidence))

    exam.status = ExamStatus.ANALYZED
    summary = {
        "exam_id": exam.id,
        "students": len(submissions),
        "answers": len(answer_ids),
        "score_mismatches": mismatches,
        "weak_threshold_percent": settings.weak_threshold_percent,
    }
    audit(db, actor, "exam.analyzed", exam, {k: v for k, v in summary.items() if k != "exam_id"})
    db.commit()
    return summary


def concept_slides(db: Session, concept_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[SlideRef]]:
    """Instructor-approved slides per concept (plan 7.6). Never invents a source (FR-35)."""
    rows = db.execute(
        select(ConceptSlideChunk.concept_id, SlideChunk, Material.filename)
        .join(SlideChunk, SlideChunk.id == ConceptSlideChunk.slide_chunk_id)
        .join(Material, Material.id == SlideChunk.material_id)
        .where(
            ConceptSlideChunk.concept_id.in_(concept_ids),
            ConceptSlideChunk.mapping_status == MappingStatus.APPROVED,
        )
        .order_by(Material.filename, SlideChunk.page_number)
    )
    slides: dict[uuid.UUID, list[SlideRef]] = {cid: [] for cid in concept_ids}
    for concept_id, chunk, filename in rows:
        slides[concept_id].append(
            SlideRef(
                material_id=chunk.material_id,
                filename=filename,
                page_number=chunk.page_number,
                title=chunk.title,
                excerpt=_excerpt(chunk),
            )
        )
    return slides


def build_student_report(db: Session, exam: Exam, student: User) -> StudentReport | None:
    """None when the student has no approved, analysed submission for this exam."""
    if exam.status != ExamStatus.ANALYZED:
        return None
    submission = db.scalar(
        select(Submission)
        .where(
            Submission.exam_id == exam.id,
            Submission.student_id == student.id,
            Submission.approval_status == ImportStatus.APPROVED,
        )
        .options(selectinload(Submission.answers))
    )
    if submission is None:
        return None

    specs = question_specs(db, exam)
    answers = {a.question_id: a for a in submission.answers}
    scores = concept_scores(
        specs,
        {qid: a.answer_text for qid, a in answers.items()},
        weak_threshold=settings.weak_threshold_percent,
        min_questions=settings.min_questions_per_concept,
    )
    concept_names = {c.id: c.name for c in db.scalars(select(Concept).where(Concept.id.in_(scores.keys())))}
    slides = concept_slides(db, list(scores.keys()))
    diagnoses = {
        d.answer_id: d
        for d in db.scalars(select(Diagnosis).where(Diagnosis.answer_id.in_([a.id for a in answers.values()])))
    }
    course = db.get(Course, exam.course_id)
    prompts = {q.id: q.prompt for q in exam.questions}

    concepts = sorted(
        (
            ConceptReport(
                concept_id=cid,
                name=concept_names[cid],
                earned=s.earned,
                max=s.max,
                percent=s.percent,
                question_count=s.question_count,
                status=s.status,
                slides=slides[cid],
            )
            for cid, s in scores.items()
        ),
        key=lambda c: (c.percent, c.name),
    )

    questions = []
    for q in specs:
        answer = answers.get(q.id)
        diagnosis = diagnoses.get(answer.id) if answer else None
        chosen = answer.answer_text if answer else None
        questions.append(
            QuestionResult(
                question_code=q.code,
                prompt=prompts[q.id],
                concept_names=[concept_names[c] for c in q.concept_weights if c in concept_names],
                your_answer=chosen,
                your_answer_text=_option_text(q, chosen),
                correct_answer=q.answer_key,
                correct_answer_text=_option_text(q, q.answer_key),
                score=score_answer(q, chosen),
                max_score=q.max_score,
                likely_cause=diagnosis.error_type if diagnosis else None,
                evidence=diagnosis.evidence if diagnosis else None,
            )
        )

    return StudentReport(
        exam_id=exam.id,
        exam_title=exam.title,
        course_id=course.id,
        course_title=course.title,
        student_id=student.id,
        student_name=student.name,
        student_ref=student.student_ref,
        earned=sum(r.score for r in questions),
        max=sum(r.max_score for r in questions),
        weak_threshold_percent=settings.weak_threshold_percent,
        concepts=concepts,
        questions=questions,
    )


def class_results(db: Session, exam: Exam) -> list[StudentResultRow]:
    """One row per student with an approved submission: total score and weak concepts."""
    specs = question_specs(db, exam)
    concept_ids = {cid for q in specs for cid in q.concept_weights}
    names = {c.id: c.name for c in db.scalars(select(Concept).where(Concept.id.in_(concept_ids)))}
    rows = []
    for submission in approved_submissions(db, exam):
        student = db.get(User, submission.student_id)
        chosen = {a.question_id: a.answer_text for a in submission.answers}
        scores = concept_scores(
            specs,
            chosen,
            weak_threshold=settings.weak_threshold_percent,
            min_questions=settings.min_questions_per_concept,
        )
        rows.append(
            StudentResultRow(
                student_id=student.id,
                student_ref=student.student_ref,
                student_name=student.name,
                earned=sum(score_answer(q, chosen.get(q.id)) for q in specs),
                max=sum(q.max_score for q in specs),
                weak_concepts=sorted(names[c] for c, s in scores.items() if s.status == WEAK),
            )
        )
    return sorted(rows, key=lambda r: r.student_ref or r.student_name)


def _option_text(q: QuestionSpec, key: str | None) -> str | None:
    return next((o["text"] for o in q.options if key and o["key"].casefold() == key.strip().casefold()), None)


def _excerpt(chunk: SlideChunk) -> str:
    body = chunk.content
    if chunk.title and body.startswith(chunk.title):
        body = body[len(chunk.title) :]
    body = " ".join(body.split())
    return body if len(body) <= EXCERPT_CHARS else body[: EXCERPT_CHARS - 1].rstrip() + "…"
