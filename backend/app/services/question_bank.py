"""The question bank: practice and retest items per concept, reviewed by the instructor (FR-39).

- Only approved items reach students (BR-11). Items the instructor writes are approved as they are
  saved; AI drafts wait for review.
- An item is practice or retest, never both, and its question must differ from the course's exam
  questions and from the concept's other items, so the retest doesn't measure memorisation (BR-10).
- An item a retest has drawn is frozen: editing or deleting it would change that retest's results.
  It can be withdrawn instead, which stops it being served.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import BankQuestion, Concept, Exam, Material, Question, RetestResponse, SlideChunk, User
from app.models.enums import BankOrigin, ReviewStatus
from app.schemas.bank import BankItemIn, BankItemOut, BankOverview
from app.schemas.recovery import BankOption
from app.services.audit import audit
from app.services.recovery import RETEST_QUESTIONS_PER_CONCEPT
from app.services.scoring import normalize
from app.services.slides import concept_slides, slide_ref


class BankBlocked(Exception):
    """The change is not allowed; the message says why."""


def overview(db: Session, concept: Concept) -> BankOverview:
    items = list(
        db.scalars(
            select(BankQuestion)
            .where(BankQuestion.concept_id == concept.id)
            .order_by(BankQuestion.usage, BankQuestion.created_at, BankQuestion.prompt)
        )
    )
    uses = dict(
        db.execute(
            select(RetestResponse.bank_question_id, func.count())
            .where(RetestResponse.bank_question_id.in_([i.id for i in items]))
            .group_by(RetestResponse.bank_question_id)
        ).all()
    )
    sources = _sources(db, [i.source_chunk_id for i in items if i.source_chunk_id])
    return BankOverview(
        concept_id=concept.id,
        concept_name=concept.name,
        course_id=concept.course_id,
        retest_questions_per_concept=RETEST_QUESTIONS_PER_CONCEPT,
        slides=concept_slides(db, [concept.id])[concept.id],
        items=[
            BankItemOut(
                id=i.id,
                usage=i.usage,
                prompt=i.prompt,
                options=[BankOption(key=o["key"], text=o["text"]) for o in i.options],
                answer_key=i.answer_key,
                origin=i.origin,
                review_status=i.review_status,
                source=sources.get(i.source_chunk_id) if i.source_chunk_id else None,
                used_in_retests=uses.get(i.id, 0),
                created_at=i.created_at,
            )
            for i in items
        ],
    )


def add(db: Session, concept: Concept, body: BankItemIn, user: User) -> BankQuestion:
    item = BankQuestion(concept_id=concept.id, origin=BankOrigin.INSTRUCTOR, review_status=ReviewStatus.APPROVED)
    _apply(db, concept, item, body)
    db.add(item)
    db.flush()
    audit(db, user, "bank.added", item, {"usage": item.usage, "prompt": item.prompt})
    db.commit()
    return item


def update(db: Session, concept: Concept, item: BankQuestion, body: BankItemIn, user: User) -> None:
    _require_unused(db, item, "edited")
    before = item.prompt
    _apply(db, concept, item, body)
    audit(db, user, "bank.updated", item, {"before": before, "after": item.prompt, "usage": item.usage})
    db.commit()


def approve(db: Session, concept: Concept, item: BankQuestion, user: User) -> None:
    if item.review_status == ReviewStatus.APPROVED:
        return
    _require_distinct(db, concept, item.prompt, exclude=item.id)
    item.review_status = ReviewStatus.APPROVED
    audit(db, user, "bank.approved", item, {"origin": item.origin, "prompt": item.prompt})
    db.commit()


def withdraw(db: Session, item: BankQuestion, user: User) -> None:
    """Stop serving an item without deleting it, for example one a retest already used."""
    if item.review_status == ReviewStatus.PENDING:
        return
    item.review_status = ReviewStatus.PENDING
    audit(db, user, "bank.withdrawn", item, {"prompt": item.prompt})
    db.commit()


def delete(db: Session, item: BankQuestion, user: User) -> None:
    _require_unused(db, item, "deleted")
    audit(db, user, "bank.deleted", item, {"usage": item.usage, "prompt": item.prompt})
    db.delete(item)
    db.commit()


def _apply(db: Session, concept: Concept, item: BankQuestion, body: BankItemIn) -> None:
    prompt = " ".join(body.prompt.split())
    options = [{"key": o.key.strip().upper(), "text": o.text.strip()} for o in body.options]
    keys = [o["key"] for o in options]
    if any(not o["text"] for o in options):
        raise BankBlocked("Every option needs text.")
    if len(set(keys)) != len(keys):
        raise BankBlocked("Each option needs its own letter.")
    answer_key = body.answer_key.strip().upper()
    if answer_key not in keys:
        raise BankBlocked(f'The correct answer "{body.answer_key}" is not one of the options ({", ".join(keys)}).')
    if body.source_chunk_id is not None:
        _require_course_slide(db, concept, body.source_chunk_id)
    _require_distinct(db, concept, prompt, exclude=item.id)
    item.usage, item.prompt, item.options, item.answer_key = body.usage, prompt, options, answer_key
    item.source_chunk_id = body.source_chunk_id


def _require_distinct(db: Session, concept: Concept, prompt: str, exclude: uuid.UUID | None) -> None:
    """BR-10: not an exam question of the course, and not another item of this concept."""
    wanted = normalize(prompt)
    exam_prompts = db.scalars(
        select(Question.prompt).join(Exam, Exam.id == Question.exam_id).where(Exam.course_id == concept.course_id)
    )
    if any(normalize(p) == wanted for p in exam_prompts):
        raise BankBlocked("This question is already on an exam. Practice and retest questions must be new ones.")
    others = db.execute(
        select(BankQuestion.id, BankQuestion.prompt, BankQuestion.usage).where(BankQuestion.concept_id == concept.id)
    )
    for other_id, other_prompt, usage in others:
        if other_id != exclude and normalize(other_prompt) == wanted:
            raise BankBlocked(f"The same question is already in this concept's {usage} items.")


def _require_unused(db: Session, item: BankQuestion, verb: str) -> None:
    n = db.scalar(select(func.count()).where(RetestResponse.bank_question_id == item.id)) or 0
    if n:
        raise BankBlocked(
            f"{n} retest{'s have' if n != 1 else ' has'} used this question, so it can't be {verb}: that would change "
            "those results. Withdraw it instead, and add a new question if needed."
        )


def _require_course_slide(db: Session, concept: Concept, slide_chunk_id: uuid.UUID) -> None:
    chunk = db.get(SlideChunk, slide_chunk_id)
    material = db.get(Material, chunk.material_id) if chunk else None
    if material is None or material.course_id != concept.course_id:
        raise BankBlocked("That slide is not in this course's lectures.")


def _sources(db: Session, chunk_ids: list[uuid.UUID]) -> dict:
    rows = db.execute(
        select(SlideChunk, Material.filename)
        .join(Material, Material.id == SlideChunk.material_id)
        .where(SlideChunk.id.in_(chunk_ids))
    )
    return {chunk.id: slide_ref(chunk, filename) for chunk, filename in rows}
