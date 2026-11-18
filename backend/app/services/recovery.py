"""Recovery plans, practice and retests (FR-36..FR-44)."""

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    BankQuestion,
    Concept,
    Exam,
    Material,
    RecoveryPlan,
    RecoveryTask,
    Retest,
    RetestResponse,
    SlideChunk,
    Submission,
)
from app.models.base import utcnow
from app.models.enums import BankUsage, PlanStatus, RetestStatus, ReviewStatus, TaskStatus, TaskType
from app.schemas.recovery import (
    BankOption,
    BankQuestionOut,
    ConceptGain,
    PlanConcept,
    PracticeCheckOut,
    RecoveryPlanOut,
    RetestOut,
    RetestQuestionResult,
    RetestResults,
    RetestSummary,
    TaskOut,
)
from app.services.exam_data import question_specs, student_submission, submission_concept_scores
from app.services.scoring import WEAK, QuestionSpec, normalize, option_text
from app.services.slides import concept_slides, slide_ref

MAX_SLIDES_PER_CONCEPT = 3
RETEST_QUESTIONS_PER_CONCEPT = 3
GAIN_NOTE = (
    "The retest uses different questions from the exam, so their difficulty may differ. "
    "Treat the change as an early sign of progress, not proof of mastery."
)


class RecoveryError(Exception):
    """A request that cannot be done in the current state; the message says why."""


# --- plans -------------------------------------------------------------------------------------


def create_plans(db: Session, exam: Exam, submissions: list[Submission], specs: list[QuestionSpec]) -> int:
    """One plan per student with weak concepts, weakest first (FR-36). Returns plans created.

    Re-running analysis rebuilds plans, except a plan whose student already took a retest:
    that progress is kept.
    """
    existing = {p.student_id: p for p in db.scalars(select(RecoveryPlan).where(RecoveryPlan.exam_id == exam.id))}
    with_retests = set(
        db.scalars(select(Retest.plan_id).where(Retest.plan_id.in_([p.id for p in existing.values()])))
    )
    names = {c.id: c.name for c in db.scalars(select(Concept).where(Concept.course_id == exam.course_id))}
    slides = concept_slides(db, list(names))

    created = 0
    for submission in submissions:
        old = existing.get(submission.student_id)
        if old is not None:
            if old.id in with_retests:
                continue
            db.delete(old)
            db.flush()

        scores = submission_concept_scores(specs, submission)
        weak = sorted((s for s in scores.values() if s.status == WEAK), key=lambda s: (s.percent, names[s.concept_id]))
        if not weak:
            continue

        plan = RecoveryPlan(student_id=submission.student_id, course_id=exam.course_id, exam_id=exam.id)
        db.add(plan)
        db.flush()
        priority = 0
        for score in weak:
            for slide in slides[score.concept_id][:MAX_SLIDES_PER_CONCEPT]:
                db.add(RecoveryTask(
                    plan_id=plan.id, concept_id=score.concept_id, slide_chunk_id=slide.slide_chunk_id,
                    task_type=TaskType.REVIEW_SLIDE, priority=priority,
                ))
                priority += 1
            db.add(RecoveryTask(
                plan_id=plan.id, concept_id=score.concept_id, task_type=TaskType.PRACTICE, priority=priority
            ))
            priority += 1
        created += 1
    return created


def plan_view(db: Session, plan: RecoveryPlan) -> RecoveryPlanOut:
    exam = db.get(Exam, plan.exam_id)
    before = _before_scores(db, plan)
    concept_ids = _plan_concept_ids(plan)
    names = {c.id: c.name for c in db.scalars(select(Concept).where(Concept.id.in_(concept_ids)))}
    chunks = _chunks_with_filenames(db, [t.slide_chunk_id for t in plan.tasks if t.slide_chunk_id])

    concepts = []
    for cid in concept_ids:
        tasks = [
            TaskOut(
                id=t.id,
                task_type=t.task_type,
                status=t.status,
                slide=slide_ref(*chunks[t.slide_chunk_id]) if t.slide_chunk_id in chunks else None,
            )
            for t in plan.tasks
            if t.concept_id == cid
        ]
        concepts.append(
            PlanConcept(
                concept_id=cid,
                name=names[cid],
                percent_before=before[cid].percent if cid in before else 0.0,
                practice_count=len(_bank(db, [cid], BankUsage.PRACTICE)),
                tasks=tasks,
            )
        )

    retests = db.scalars(select(Retest).where(Retest.plan_id == plan.id).order_by(Retest.created_at.desc()))
    return RecoveryPlanOut(
        id=plan.id,
        exam_id=exam.id,
        exam_title=exam.title,
        course_id=plan.course_id,
        status=plan.status,
        concepts=concepts,
        retest_question_count=len(_retest_selection(db, concept_ids)),
        retests=[
            RetestSummary(
                id=r.id, status=r.status, submitted_at=r.submitted_at,
                total_score=r.total_score, max_score=float(len(r.responses)),
            )
            for r in retests
        ],
    )


def complete_task(db: Session, task: RecoveryTask) -> None:
    """FR-40. Idempotent."""
    if task.status != TaskStatus.COMPLETED:
        task.status = TaskStatus.COMPLETED
        task.completed_at = utcnow()
    db.commit()


# --- practice ----------------------------------------------------------------------------------


def practice_questions(db: Session, concept_id: uuid.UUID) -> list[BankQuestionOut]:
    """Approved practice items only (BR-11, TC-25); answer keys are never sent."""
    return [_bank_out(b) for b in _bank(db, [concept_id], BankUsage.PRACTICE)]


def check_practice(db: Session, item: BankQuestion, answer: str) -> PracticeCheckOut:
    source = None
    if item.source_chunk_id:
        chunk = db.get(SlideChunk, item.source_chunk_id)
        source = slide_ref(chunk, db.get(Material, chunk.material_id).filename)
    return PracticeCheckOut(
        correct=normalize(answer) == normalize(item.answer_key),
        correct_answer=item.answer_key,
        correct_answer_text=option_text(item.options, item.answer_key),
        source=source,
    )


# --- retests -----------------------------------------------------------------------------------


def start_retest(db: Session, plan: RecoveryPlan) -> Retest:
    """FR-41. Reuses an unfinished retest so a page refresh does not change the questions."""
    open_retest = db.scalar(
        select(Retest).where(Retest.plan_id == plan.id, Retest.status == RetestStatus.IN_PROGRESS)
    )
    if open_retest:
        return open_retest
    items = _retest_selection(db, _plan_concept_ids(plan))
    if not items:
        raise RecoveryError("There are no approved retest questions for these concepts yet.")
    retest = Retest(student_id=plan.student_id, plan_id=plan.id)
    db.add(retest)
    db.flush()
    db.add_all(RetestResponse(retest_id=retest.id, bank_question_id=b.id) for b in items)
    db.commit()
    return retest


def retest_view(db: Session, retest: Retest) -> RetestOut:
    items = _items_for(db, retest)
    return RetestOut(
        id=retest.id,
        plan_id=retest.plan_id,
        status=retest.status,
        questions=[_bank_out(items[r.bank_question_id]) for r in retest.responses],
    )


def submit_retest(db: Session, retest: Retest, answers: dict[uuid.UUID, str]) -> None:
    if retest.status != RetestStatus.IN_PROGRESS:
        raise RecoveryError("This retest was already submitted.")
    by_question = {r.bank_question_id: r for r in retest.responses}
    unknown = set(answers) - set(by_question)
    if unknown:
        raise RecoveryError("Some answers are for questions that are not in this retest.")

    items = _items_for(db, retest)
    for qid, response in by_question.items():
        response.answer = answers.get(qid)
        response.score = 1.0 if normalize(response.answer) == normalize(items[qid].answer_key) else 0.0
    retest.total_score = sum(r.score for r in retest.responses)
    retest.status = RetestStatus.SUBMITTED
    retest.submitted_at = utcnow()
    db.get(RecoveryPlan, retest.plan_id).status = PlanStatus.COMPLETED
    db.commit()


def retest_results(db: Session, retest: Retest) -> RetestResults:
    if retest.status != RetestStatus.SUBMITTED:
        raise RecoveryError("Submit the retest to see results.")
    plan = db.get(RecoveryPlan, retest.plan_id)
    view = plan_view(db, plan)
    items = _items_for(db, retest)
    names = {c.concept_id: c.name for c in view.concepts}
    before = _before_scores(db, plan)

    after: dict[uuid.UUID, list[float]] = defaultdict(list)
    for r in retest.responses:
        after[items[r.bank_question_id].concept_id].append(r.score or 0.0)

    concepts = []
    for c in view.concepts:
        scores = after.get(c.concept_id, [])
        b = before.get(c.concept_id)
        # Subtract unrounded values: 66.7 - 33.3 must show +33.3, not +33.4.
        before_raw = 100 * b.earned / b.max if b and b.max else 0.0
        after_raw = 100 * sum(scores) / len(scores) if scores else 0.0
        concepts.append(
            ConceptGain(
                concept_id=c.concept_id,
                name=c.name,
                before_percent=round(before_raw, 1),
                before_question_count=b.question_count if b else 0,
                after_percent=round(after_raw, 1),
                after_question_count=len(scores),
                gain_points=round(after_raw - before_raw, 1),  # TC-24, percentage points
            )
        )

    return RetestResults(
        retest_id=retest.id,
        plan_id=plan.id,
        submitted_at=retest.submitted_at,
        total_score=retest.total_score or 0.0,
        max_score=float(len(retest.responses)),
        concepts=concepts,
        questions=[
            RetestQuestionResult(
                bank_question_id=r.bank_question_id,
                concept_name=names.get(items[r.bank_question_id].concept_id, ""),
                prompt=items[r.bank_question_id].prompt,
                your_answer=r.answer,
                correct_answer=items[r.bank_question_id].answer_key,
                correct_answer_text=option_text(items[r.bank_question_id].options, items[r.bank_question_id].answer_key),
                correct=bool(r.score),
            )
            for r in retest.responses
        ],
        note=GAIN_NOTE,
    )


# --- helpers -----------------------------------------------------------------------------------


def _plan_concept_ids(plan: RecoveryPlan) -> list[uuid.UUID]:
    """Concepts in plan priority order."""
    seen: list[uuid.UUID] = []
    for t in plan.tasks:
        if t.concept_id not in seen:
            seen.append(t.concept_id)
    return seen


def _bank(db: Session, concept_ids: list[uuid.UUID], usage: BankUsage) -> list[BankQuestion]:
    return list(
        db.scalars(
            select(BankQuestion)
            .where(
                BankQuestion.concept_id.in_(concept_ids),
                BankQuestion.usage == usage,
                BankQuestion.review_status == ReviewStatus.APPROVED,
            )
            .order_by(BankQuestion.created_at, BankQuestion.prompt)
        )
    )


def _retest_selection(db: Session, concept_ids: list[uuid.UUID]) -> list[BankQuestion]:
    """Retest items only, never practice ones (BR-10), for the plan's weak concepts."""
    selected = []
    for cid in concept_ids:
        selected += _bank(db, [cid], BankUsage.RETEST)[:RETEST_QUESTIONS_PER_CONCEPT]
    return selected


def _items_for(db: Session, retest: Retest) -> dict[uuid.UUID, BankQuestion]:
    ids = [r.bank_question_id for r in retest.responses]
    return {b.id: b for b in db.scalars(select(BankQuestion).where(BankQuestion.id.in_(ids)))}


def _before_scores(db: Session, plan: RecoveryPlan) -> dict:
    """The student's per-concept scores on the original exam."""
    exam = db.get(Exam, plan.exam_id)
    submission = student_submission(db, exam, plan.student_id)
    return submission_concept_scores(question_specs(db, exam), submission) if submission else {}


def _chunks_with_filenames(db: Session, chunk_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[SlideChunk, str]]:
    rows = db.execute(
        select(SlideChunk, Material.filename)
        .join(Material, Material.id == SlideChunk.material_id)
        .where(SlideChunk.id.in_(chunk_ids))
    )
    return {chunk.id: (chunk, filename) for chunk, filename in rows}


def _bank_out(item: BankQuestion) -> BankQuestionOut:
    return BankQuestionOut(
        id=item.id,
        concept_id=item.concept_id,
        prompt=item.prompt,
        options=[BankOption(key=o["key"], text=o["text"]) for o in item.options],
    )
