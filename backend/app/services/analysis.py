"""Runs analysis on an exam's approved answers and builds student reports (FR-24..FR-30)."""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Concept, Course, Diagnosis, Exam, ImportBatch, RecoveryPlan, User
from app.models.enums import ExamStatus, ImportStatus
from app.schemas.report import ConceptReport, QuestionResult, StudentReport, StudentResultRow
from app.services.audit import audit
from app.services.exam_data import (
    approved_submissions,
    question_specs,
    student_submission,
    submission_concept_scores,
)
from app.services.recovery import create_plans
from app.services.scoring import WEAK, QuestionSpec, likely_cause, option_text, score_answer
from app.services.slides import concept_slides


class AnalysisBlocked(Exception):
    """The exam is not ready for analysis; the message says what to do."""


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

    specs = question_specs(db, exam)
    by_id = {q.id: q for q in specs}
    answer_ids = [a.id for s in submissions for a in s.answers]
    db.execute(delete(Diagnosis).where(Diagnosis.answer_id.in_(answer_ids)))  # re-running replaces them

    mismatches = 0
    for submission in submissions:
        for answer in submission.answers:
            q = by_id[answer.question_id]
            answer.computed_score = score_answer(q, answer.answer_text)  # official_score untouched (BR-01)
            if answer.official_score is not None and answer.official_score != answer.computed_score:
                mismatches += 1
            cause = likely_cause(q, answer.answer_text)
            if cause:
                error_type, evidence = cause
                db.add(Diagnosis(answer_id=answer.id, error_type=error_type, evidence=evidence))

    plans = create_plans(db, exam, submissions, specs)
    exam.status = ExamStatus.ANALYZED
    summary = {
        "exam_id": exam.id,
        "students": len(submissions),
        "answers": len(answer_ids),
        "score_mismatches": mismatches,
        "recovery_plans": plans,
        "weak_threshold_percent": settings.weak_threshold_percent,
    }
    audit(db, actor, "exam.analyzed", exam, {k: v for k, v in summary.items() if k != "exam_id"})
    db.commit()
    return summary


def build_student_report(db: Session, exam: Exam, student: User) -> StudentReport | None:
    """None when the student has no approved, analysed submission for this exam."""
    if exam.status != ExamStatus.ANALYZED:
        return None
    submission = student_submission(db, exam, student.id)
    if submission is None:
        return None

    specs = question_specs(db, exam)
    answers = {a.question_id: a for a in submission.answers}
    scores = submission_concept_scores(specs, submission)
    concept_names = {c.id: c.name for c in db.scalars(select(Concept).where(Concept.id.in_(scores.keys())))}
    slides = concept_slides(db, list(scores.keys()))
    diagnoses = {
        d.answer_id: d
        for d in db.scalars(select(Diagnosis).where(Diagnosis.answer_id.in_([a.id for a in answers.values()])))
    }
    course = db.get(Course, exam.course_id)
    prompts = {q.id: q.prompt for q in exam.questions}
    plan_id = db.scalar(
        select(RecoveryPlan.id).where(RecoveryPlan.exam_id == exam.id, RecoveryPlan.student_id == student.id)
    )

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
                your_answer_text=option_text(q.options, chosen),
                correct_answer=q.answer_key,
                correct_answer_text=option_text(q.options, q.answer_key),
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
        recovery_plan_id=plan_id,
        concepts=concepts,
        questions=questions,
    )


def class_results(db: Session, exam: Exam) -> list[StudentResultRow]:
    """One row per student with an approved submission: total score and weak concepts."""
    specs: list[QuestionSpec] = question_specs(db, exam)
    concept_ids = {cid for q in specs for cid in q.concept_weights}
    names = {c.id: c.name for c in db.scalars(select(Concept).where(Concept.id.in_(concept_ids)))}
    rows = []
    for submission in approved_submissions(db, exam):
        student = db.get(User, submission.student_id)
        chosen = {a.question_id: a.answer_text for a in submission.answers}
        scores = submission_concept_scores(specs, submission)
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

