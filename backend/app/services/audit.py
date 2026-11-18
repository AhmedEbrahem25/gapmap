from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, Exam, User


def audit(db: Session, actor: User | None, action: str, target: Any = None, details: dict | None = None) -> None:
    """NFR-10: record an approval or important edit. Committed with the caller's transaction."""
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            course_id=_course_id(db, target),
            action=action,
            target_type=getattr(target, "__tablename__", None),
            target_id=getattr(target, "id", None),
            details=details,
        )
    )


def _course_id(db: Session, target: Any):
    """Courses own everything audited: materials and exams directly, the rest through an exam."""
    if getattr(target, "course_id", None):
        return target.course_id
    exam_id = getattr(target, "exam_id", None)
    if exam_id:
        exam = db.get(Exam, exam_id)
        return exam.course_id if exam else None
    return None
