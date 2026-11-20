import uuid

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbSession, require_course_instructor
from app.models import BankQuestion, Concept
from app.schemas.bank import BankItemIn, BankOverview
from app.services import question_bank as bank_service
from app.services.question_bank import BankBlocked

router = APIRouter(tags=["question bank"])


@router.get("/concepts/{concept_id}/bank-questions", response_model=BankOverview)
def list_items(concept_id: uuid.UUID, user: CurrentUser, db: DbSession) -> BankOverview:
    """Every practice and retest item of the concept, with answer keys. Course instructor only."""
    concept = _instructor_concept(db, user, concept_id)
    return bank_service.overview(db, concept)


@router.post("/concepts/{concept_id}/bank-questions", response_model=BankOverview, status_code=status.HTTP_201_CREATED)
def add_item(concept_id: uuid.UUID, body: BankItemIn, user: CurrentUser, db: DbSession) -> BankOverview:
    """An item the instructor writes is approved as it is saved."""
    concept = _instructor_concept(db, user, concept_id)
    _run(lambda: bank_service.add(db, concept, body, user))
    return bank_service.overview(db, concept)


@router.put("/bank-questions/{item_id}", response_model=BankOverview)
def update_item(item_id: uuid.UUID, body: BankItemIn, user: CurrentUser, db: DbSession) -> BankOverview:
    item, concept = _instructor_item(db, user, item_id)
    _run(lambda: bank_service.update(db, concept, item, body, user))
    return bank_service.overview(db, concept)


@router.post("/bank-questions/{item_id}/approve", response_model=BankOverview)
def approve_item(item_id: uuid.UUID, user: CurrentUser, db: DbSession) -> BankOverview:
    """Approve a pending item, such as an AI draft, so students can be served it (BR-11)."""
    item, concept = _instructor_item(db, user, item_id)
    _run(lambda: bank_service.approve(db, concept, item, user))
    return bank_service.overview(db, concept)


@router.post("/bank-questions/{item_id}/withdraw", response_model=BankOverview)
def withdraw_item(item_id: uuid.UUID, user: CurrentUser, db: DbSession) -> BankOverview:
    item, concept = _instructor_item(db, user, item_id)
    _run(lambda: bank_service.withdraw(db, item, user))
    return bank_service.overview(db, concept)


@router.delete("/bank-questions/{item_id}", response_model=BankOverview)
def delete_item(item_id: uuid.UUID, user: CurrentUser, db: DbSession) -> BankOverview:
    item, concept = _instructor_item(db, user, item_id)
    _run(lambda: bank_service.delete(db, item, user))
    return bank_service.overview(db, concept)


def _instructor_concept(db: DbSession, user: CurrentUser, concept_id: uuid.UUID) -> Concept:
    concept = db.get(Concept, concept_id)
    if concept is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Concept not found.")
    require_course_instructor(db, user, concept.course_id)
    return concept


def _instructor_item(db: DbSession, user: CurrentUser, item_id: uuid.UUID) -> tuple[BankQuestion, Concept]:
    item = db.get(BankQuestion, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found.")
    return item, _instructor_concept(db, user, item.concept_id)


def _run(action):
    try:
        return action()
    except BankBlocked as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
