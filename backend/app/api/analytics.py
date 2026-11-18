import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, get_accessible_course
from app.models import Exam, Submission
from app.models.enums import ImportStatus, Role
from app.schemas.analytics import ClassAnalytics
from app.services.class_analytics import class_analytics

router = APIRouter(tags=["analytics"])


@router.get("/courses/{course_id}/analytics", response_model=ClassAnalytics)
def course_analytics(
    course_id: uuid.UUID, user: CurrentUser, db: DbSession, exam_id: uuid.UUID | None = None
) -> ClassAnalytics:
    """Aggregated only, so coordinators may see it too; students may not (FR-45)."""
    if user.role == Role.STUDENT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Class analytics are for instructors.")
    course = get_accessible_course(db, user, course_id)

    if exam_id is not None:
        exam = db.get(Exam, exam_id)
        if exam is None or exam.course_id != course.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found in this course.")
    else:
        # Default: the most recent exam that has approved results.
        exam = db.scalar(
            select(Exam)
            .join(Submission, Submission.exam_id == Exam.id)
            .where(Exam.course_id == course.id, Submission.approval_status == ImportStatus.APPROVED)
            .order_by(Exam.exam_date.desc(), Exam.created_at.desc())
            .limit(1)
        )
    return class_analytics(db, course, exam)
