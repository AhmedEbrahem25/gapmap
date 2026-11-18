from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, User


def audit(db: Session, actor: User | None, action: str, target: Any = None, details: dict | None = None) -> None:
    """NFR-10: record an approval or important edit. Committed with the caller's transaction."""
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            action=action,
            target_type=getattr(target, "__tablename__", None),
            target_id=getattr(target, "id", None),
            details=details,
        )
    )
