"""The demo dataset must satisfy the plan's own rules, or the demo story breaks."""

from collections import Counter

from sqlalchemy import func, select

from app.core.config import settings
from app.models import (
    Answer,
    BankQuestion,
    Concept,
    ConceptSlideChunk,
    ImportBatch,
    Question,
    QuestionConcept,
    SlideChunk,
    Submission,
    User,
)
from app.models.enums import ImportStatus, MappingStatus, ReviewStatus


def test_slides_have_real_page_numbers_text_and_images(db):
    chunks = db.scalars(select(SlideChunk).order_by(SlideChunk.page_number)).all()
    assert [c.page_number for c in chunks] == list(range(1, 13))
    assert all(c.content and c.title for c in chunks)
    assert all((settings.storage_dir / c.image_path).is_file() for c in chunks)


def test_every_concept_has_two_or_more_questions_and_approved_slides(db):
    for concept in db.scalars(select(Concept)):
        n_questions = db.scalar(select(func.count()).where(QuestionConcept.concept_id == concept.id))
        n_slides = db.scalar(
            select(func.count()).where(
                ConceptSlideChunk.concept_id == concept.id,
                ConceptSlideChunk.mapping_status == MappingStatus.APPROVED,
            )
        )
        assert n_questions >= 2, concept.name  # plan Section 12: minimum evidence
        assert n_slides >= 1, concept.name  # BR-04


def test_every_question_has_a_concept_and_a_valid_key(db):
    for q in db.scalars(select(Question)):
        assert q.concepts, q.question_code  # BR-03
        assert q.answer_key in {o["key"] for o in q.options}


def test_bank_has_separate_approved_practice_and_retest_per_concept(db):
    exam_prompts = set(db.scalars(select(Question.prompt)))
    for concept in db.scalars(select(Concept)):
        approved = db.scalars(
            select(BankQuestion).where(
                BankQuestion.concept_id == concept.id, BankQuestion.review_status == ReviewStatus.APPROVED
            )
        ).all()
        usage = Counter(b.usage for b in approved)
        assert usage["practice"] >= 3 and usage["retest"] >= 3, concept.name
        assert not exam_prompts & {b.prompt for b in approved}  # BR-10


def test_one_pending_ai_question_exists_for_tc25(db):
    pending = db.scalars(select(BankQuestion).where(BankQuestion.review_status == ReviewStatus.PENDING)).all()
    assert len(pending) == 1 and pending[0].origin == "ai"


def test_results_are_imported_as_approved_with_official_scores_only(db, demo):
    assert demo["answers"] == 180
    assert db.scalar(select(ImportBatch)).status == ImportStatus.APPROVED
    assert all(s.approval_status == ImportStatus.APPROVED for s in db.scalars(select(Submission)))
    # computed_score is the analysis step's job (S3); the seed must not fill it (BR-01)
    assert db.scalar(select(func.count()).where(Answer.computed_score.is_not(None))) == 0


def test_stu001_misses_exactly_q1_q2_q4_q5(db):
    stu = db.scalar(select(User).where(User.student_ref == "STU001"))
    sub = db.scalar(select(Submission).where(Submission.student_id == stu.id))
    wrong = sorted(a.question.question_code for a in sub.answers if a.official_score == 0)
    assert wrong == ["Q1", "Q2", "Q4", "Q5"]


def test_most_of_the_class_struggles_with_scrum_roles(db):
    scrum = db.scalar(select(Concept).where(Concept.name == "Scrum Roles"))
    scores = db.scalars(
        select(Answer.official_score)
        .join(QuestionConcept, QuestionConcept.question_id == Answer.question_id)
        .where(QuestionConcept.concept_id == scrum.id)
    ).all()
    assert scores.count(0) / len(scores) > 0.6
