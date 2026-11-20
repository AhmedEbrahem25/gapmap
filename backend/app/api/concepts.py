import uuid

from fastapi import APIRouter, HTTPException, Response, status

from app.core.deps import CurrentUser, DbSession, require_course_instructor
from app.models import Concept, Course
from app.schemas.course import ConceptDetail, ConceptIn, SlideSuggestion
from app.services import concepts as concept_service
from app.services.concepts import ConceptBlocked

router = APIRouter(tags=["concepts"])


@router.get("/courses/{course_id}/concepts", response_model=list[ConceptDetail])
def list_concepts(course_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[ConceptDetail]:
    """Concepts with their approved slides and question counts. Course instructor only."""
    course = require_course_instructor(db, user, course_id)
    return concept_service.concept_details(db, course)


@router.post("/courses/{course_id}/concepts", response_model=ConceptDetail, status_code=status.HTTP_201_CREATED)
def create_concept(course_id: uuid.UUID, body: ConceptIn, user: CurrentUser, db: DbSession) -> ConceptDetail:
    course = require_course_instructor(db, user, course_id)
    concept = _run(lambda: concept_service.create(db, course, body, user))
    return _detail(db, course, concept.id)


@router.put("/concepts/{concept_id}", response_model=ConceptDetail)
def update_concept(concept_id: uuid.UUID, body: ConceptIn, user: CurrentUser, db: DbSession) -> ConceptDetail:
    concept, course = _instructor_concept(db, user, concept_id)
    _run(lambda: concept_service.update(db, concept, body, user))
    return _detail(db, course, concept.id)


@router.delete("/concepts/{concept_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_concept(concept_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    concept, _ = _instructor_concept(db, user, concept_id)
    _run(lambda: concept_service.delete(db, concept, user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/concepts/{concept_id}/slide-suggestions", response_model=list[SlideSuggestion])
def slide_suggestions(concept_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[SlideSuggestion]:
    """Every course page not yet approved for the concept, best keyword match first."""
    concept, _ = _instructor_concept(db, user, concept_id)
    return concept_service.suggestions(db, concept)


@router.put("/concepts/{concept_id}/slides/{slide_chunk_id}", response_model=ConceptDetail)
def approve_slide(concept_id: uuid.UUID, slide_chunk_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ConceptDetail:
    """Approve a slide for the concept: students with this weak concept will be sent to it."""
    concept, course = _instructor_concept(db, user, concept_id)
    _run(lambda: concept_service.approve_slide(db, concept, slide_chunk_id, user))
    return _detail(db, course, concept.id)


@router.delete("/concepts/{concept_id}/slides/{slide_chunk_id}", response_model=ConceptDetail)
def remove_slide(concept_id: uuid.UUID, slide_chunk_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ConceptDetail:
    concept, course = _instructor_concept(db, user, concept_id)
    _run(lambda: concept_service.remove_slide(db, concept, slide_chunk_id, user))
    return _detail(db, course, concept.id)


def _instructor_concept(db: DbSession, user: CurrentUser, concept_id: uuid.UUID) -> tuple[Concept, Course]:
    concept = db.get(Concept, concept_id)
    if concept is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Concept not found.")
    return concept, require_course_instructor(db, user, concept.course_id)


def _detail(db: DbSession, course: Course, concept_id: uuid.UUID) -> ConceptDetail:
    return next(c for c in concept_service.concept_details(db, course) if c.id == concept_id)


def _run(action):
    try:
        return action()
    except ConceptBlocked as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None
