import uuid
from collections.abc import Callable
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models import Course, CourseEnrollment, User
from app.models.enums import Role

# tokenUrl powers the "Authorize" button in Swagger (/docs).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(db: DbSession, token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized from None
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: Role) -> Callable[[User], User]:
    """FR-02 / NFR-01: route-level role check. Use as `Depends(require_roles(Role.INSTRUCTOR))`."""

    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role is not allowed to do this.")
        return user

    return checker


def can_access_course(db: Session, user: User, course: Course) -> bool:
    """FR-04. Coordinators get course-level access here; student-level data must be
    blocked separately on student-level endpoints (TC-27)."""
    if user.role in (Role.ADMIN, Role.COORDINATOR):
        return True
    if user.role == Role.INSTRUCTOR:
        return course.instructor_id == user.id
    if user.role == Role.STUDENT:
        enrolled = db.scalar(
            select(CourseEnrollment).where(
                CourseEnrollment.course_id == course.id, CourseEnrollment.student_id == user.id
            )
        )
        return enrolled is not None
    return False


def get_accessible_course(db: Session, user: User, course_id: uuid.UUID) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    if not can_access_course(db, user, course):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this course.")
    return course
