import uuid
from datetime import datetime
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, get_accessible_course, require_course_instructor
from app.models import AuditLog, Concept, User
from app.schemas.report import SlideRef
from app.services.explanations import ClaudeExplainer, Explainer, ExplainerUnavailable, get_explanation

router = APIRouter(tags=["explanations"])


class ExplanationOut(BaseModel):
    status: str  # ready | unavailable
    explanation: str | None = None
    key_points: list[str] = []
    sources: list[SlideRef] = []
    model: str | None = None
    message: str | None = None  # why it is unavailable


class AuditEntryOut(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    actor_name: str | None
    action: str
    target_type: str | None
    details: dict | None


@lru_cache
def get_explainer() -> Explainer:
    """One client per process; tests override this dependency with a fake."""
    return ClaudeExplainer()


@router.get("/concepts/{concept_id}/explanation", response_model=ExplanationOut)
def concept_explanation(
    concept_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    explainer: Annotated[Explainer, Depends(get_explainer)],
) -> ExplanationOut:
    """Always 200: an unavailable explanation is a normal state the page handles (NFR-05)."""
    concept = db.get(Concept, concept_id)
    if concept is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Concept not found.")
    get_accessible_course(db, user, concept.course_id)
    try:
        e = get_explanation(db, concept, explainer)
    except ExplainerUnavailable as exc:
        return ExplanationOut(status="unavailable", message=str(exc))
    return ExplanationOut(
        status="ready", explanation=e.explanation, key_points=e.key_points, sources=e.sources, model=e.model
    )


@router.get("/courses/{course_id}/audit-log", response_model=list[AuditEntryOut])
def course_audit_log(
    course_id: uuid.UUID, user: CurrentUser, db: DbSession, limit: Annotated[int, Query(ge=1, le=500)] = 200
) -> list[AuditEntryOut]:
    """NFR-10 / TC-26: approvals and important edits, newest first. Instructor and admin only."""
    course = require_course_instructor(db, user, course_id)
    rows = db.execute(
        select(AuditLog, User.name)
        .outerjoin(User, User.id == AuditLog.actor_id)
        .where(AuditLog.course_id == course.id)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
    )
    return [
        AuditEntryOut(
            id=log.id, timestamp=log.timestamp, actor_name=name, action=log.action,
            target_type=log.target_type, details=log.details,
        )
        for log, name in rows
    ]
