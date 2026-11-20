"""Concepts and their approved slides (FR-09, FR-10).

The instructor defines a course's concepts and approves the slides that explain each one. Keyword
matching suggests candidate slides; nothing reaches a student until the instructor approves it
(plan 7.6, 10.2). Keyword search is enough to suggest slides for the MVP (ADR 0001 §3).
"""

import re
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    BankQuestion,
    Concept,
    ConceptSlideChunk,
    Course,
    Material,
    QuestionConcept,
    RecoveryTask,
    SlideChunk,
    User,
)
from app.models.enums import BankUsage, MappingStatus, ReviewStatus
from app.schemas.course import ConceptDetail, ConceptIn, SlideSuggestion
from app.services.audit import audit
from app.services.slides import concept_slides, slide_ref

SUGGESTION_LIMIT = 8

# Words that say nothing about which slide explains a concept.
_STOPWORDS = frozenset(
    """a an and are as at be by for from how in into is it its of on or that the their them they this
    to vs versus what when which who why with without each every between more most other than three
    two one""".split()
)
_WORD = re.compile(r"\w+", re.UNICODE)


class ConceptBlocked(Exception):
    """The change is not allowed; the message says why."""


@dataclass(frozen=True)
class Match:
    score: float
    terms: list[str]


def terms(text: str | None) -> list[str]:
    """Distinct search terms in order: lower-cased words of 3+ letters, stopwords and digits dropped,
    a plural "s" removed so "roles" matches "role"."""
    seen: dict[str, None] = {}
    for word in _WORD.findall((text or "").casefold()):
        if len(word) < 3 or word in _STOPWORDS or word.isdigit():
            continue
        seen.setdefault(_stem(word), None)
    return list(seen)


def match_slide(name: str, description: str | None, title: str | None, content: str) -> Match:
    """How well a slide matches a concept. Name words count 3, description words 1, and a word in the
    slide's title counts double. Returns the matched words so the instructor sees why (FR-34)."""
    title_terms = set(terms(title))
    body_terms = set(terms(content)) | title_terms
    weights: dict[str, float] = {t: 1.0 for t in terms(description)}
    weights.update({t: 3.0 for t in terms(name)})
    matched = [t for t in weights if t in body_terms]
    score = sum(weights[t] * (2 if t in title_terms else 1) for t in matched)
    return Match(score=score, terms=matched)


def concept_details(db: Session, course: Course) -> list[ConceptDetail]:
    concepts = list(db.scalars(select(Concept).where(Concept.course_id == course.id).order_by(Concept.name)))
    slides = concept_slides(db, [c.id for c in concepts])
    counts = dict(
        db.execute(
            select(QuestionConcept.concept_id, func.count())
            .where(QuestionConcept.concept_id.in_([c.id for c in concepts]))
            .group_by(QuestionConcept.concept_id)
        ).all()
    )
    bank: dict[tuple, int] = {
        (cid, usage, review): n
        for cid, usage, review, n in db.execute(
            select(BankQuestion.concept_id, BankQuestion.usage, BankQuestion.review_status, func.count())
            .where(BankQuestion.concept_id.in_([c.id for c in concepts]))
            .group_by(BankQuestion.concept_id, BankQuestion.usage, BankQuestion.review_status)
        )
    }
    return [
        ConceptDetail(
            id=c.id,
            name=c.name,
            description=c.description,
            question_count=counts.get(c.id, 0),
            slides=slides[c.id],
            practice_count=bank.get((c.id, BankUsage.PRACTICE, ReviewStatus.APPROVED), 0),
            retest_count=bank.get((c.id, BankUsage.RETEST, ReviewStatus.APPROVED), 0),
            pending_count=sum(bank.get((c.id, usage, ReviewStatus.PENDING), 0) for usage in BankUsage),
        )
        for c in concepts
    ]


def create(db: Session, course: Course, body: ConceptIn, user: User) -> Concept:
    name = _clean_name(body.name)
    _require_unique_name(db, course.id, name, exclude=None)
    concept = Concept(course_id=course.id, name=name, description=_clean(body.description))
    db.add(concept)
    db.flush()
    audit(db, user, "concept.created", concept, {"name": name})
    db.commit()
    return concept


def update(db: Session, concept: Concept, body: ConceptIn, user: User) -> None:
    name = _clean_name(body.name)
    _require_unique_name(db, concept.course_id, name, exclude=concept.id)
    before = {"name": concept.name, "description": concept.description}
    concept.name, concept.description = name, _clean(body.description)
    after = {"name": name, "description": concept.description}
    audit(db, user, "concept.updated", concept, {"before": before, "after": after})
    db.commit()


def delete(db: Session, concept: Concept, user: User) -> None:
    """Only an unused concept: deleting one that questions, the question bank or recovery plans point
    to would silently change students' results."""
    uses = [
        (QuestionConcept.concept_id, "exam question"),
        (BankQuestion.concept_id, "question-bank item"),
        (RecoveryTask.concept_id, "recovery-plan task"),
    ]
    for column, label in uses:
        n = db.scalar(select(func.count()).where(column == concept.id)) or 0
        if n:
            raise ConceptBlocked(
                f'"{concept.name}" is used by {n} {label}{"" if n == 1 else "s"}, so it cannot be deleted. '
                "Rename it instead."
            )
    audit(db, user, "concept.deleted", concept, {"name": concept.name})
    db.delete(concept)
    db.commit()


def suggestions(db: Session, concept: Concept) -> list[SlideSuggestion]:
    """Every page of the course's lectures that is not approved for this concept yet, best match first.

    Pages with no matching word come last with score 0, so the instructor can still pick any page.
    """
    approved = set(
        db.scalars(
            select(ConceptSlideChunk.slide_chunk_id).where(
                ConceptSlideChunk.concept_id == concept.id,
                ConceptSlideChunk.mapping_status == MappingStatus.APPROVED,
            )
        )
    )
    rows = db.execute(
        select(SlideChunk, Material.filename)
        .join(Material, Material.id == SlideChunk.material_id)
        .where(Material.course_id == concept.course_id)
        .order_by(Material.filename, SlideChunk.page_number)
    )
    out = []
    for chunk, filename in rows:
        if chunk.id in approved:
            continue
        m = match_slide(concept.name, concept.description, chunk.title, chunk.content)
        out.append(SlideSuggestion(slide=slide_ref(chunk, filename), score=m.score, matched_terms=m.terms))
    out.sort(key=lambda s: -s.score)  # stable: ties keep file and page order
    return out


def approve_slide(db: Session, concept: Concept, slide_chunk_id: uuid.UUID, user: User) -> None:
    chunk = _course_slide(db, concept, slide_chunk_id)
    mapping = db.get(ConceptSlideChunk, (concept.id, chunk.id))
    if mapping is None:
        db.add(ConceptSlideChunk(concept_id=concept.id, slide_chunk_id=chunk.id, mapping_status=MappingStatus.APPROVED))
    elif mapping.mapping_status == MappingStatus.APPROVED:
        return
    else:
        mapping.mapping_status = MappingStatus.APPROVED
    audit(db, user, "concept.slide_approved", concept, {"concept": concept.name, "page": chunk.page_number})
    db.commit()


def remove_slide(db: Session, concept: Concept, slide_chunk_id: uuid.UUID, user: User) -> None:
    chunk = _course_slide(db, concept, slide_chunk_id)
    mapping = db.get(ConceptSlideChunk, (concept.id, chunk.id))
    if mapping is None:
        return
    db.delete(mapping)
    audit(db, user, "concept.slide_removed", concept, {"concept": concept.name, "page": chunk.page_number})
    db.commit()


def _course_slide(db: Session, concept: Concept, slide_chunk_id: uuid.UUID) -> SlideChunk:
    chunk = db.get(SlideChunk, slide_chunk_id)
    material = db.get(Material, chunk.material_id) if chunk else None
    if material is None or material.course_id != concept.course_id:
        raise LookupError("That slide is not in this course's lectures.")
    return chunk


def _require_unique_name(db: Session, course_id: uuid.UUID, name: str, exclude: uuid.UUID | None) -> None:
    query = select(Concept.id).where(Concept.course_id == course_id, func.lower(Concept.name) == name.lower())
    if exclude is not None:
        query = query.where(Concept.id != exclude)
    if db.scalar(query) is not None:
        raise ConceptBlocked(f'This course already has a concept called "{name}".')


def _clean_name(name: str) -> str:
    name = " ".join(name.split())
    if not name:
        raise ConceptBlocked("Give the concept a name.")
    return name


def _clean(text: str | None) -> str | None:
    text = (text or "").strip()
    return text or None


def _stem(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word
