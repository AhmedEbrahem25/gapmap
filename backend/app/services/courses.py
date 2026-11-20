"""Courses and their students (FR-05).

Instructors create courses and enrol students by their pseudonymous reference (NFR-02). Student
accounts themselves are provisioned outside the app (plan Section 3: seed script or roster import);
a reference with no account is reported, never created.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Course, CourseEnrollment, Exam, RecoveryPlan, Submission, User
from app.models.enums import Role
from app.schemas.course import CourseIn, EnrollResult, StudentOut
from app.services.audit import audit
from app.services.scoring import normalize


class CourseBlocked(Exception):
    """The change is not allowed; the message says why."""


def create(db: Session, body: CourseIn, user: User) -> Course:
    title = " ".join(body.title.split())
    if not title:
        raise CourseBlocked("Give the course a title.")
    course = Course(instructor_id=user.id, title=title, code=_clean(body.code), term=_clean(body.term))
    db.add(course)
    db.flush()
    audit(db, user, "course.created", course, {"title": title, "code": course.code})
    db.commit()
    return course


def students(db: Session, course: Course) -> list[StudentOut]:
    rows = db.scalars(
        select(User)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .where(CourseEnrollment.course_id == course.id)
        .order_by(User.student_ref, User.name)
    )
    return [StudentOut.model_validate(u) for u in rows]


def enroll(db: Session, course: Course, refs: list[str], user: User) -> EnrollResult:
    """Enrol student accounts by reference. Matching ignores case and spaces; repeats are ignored."""
    wanted: dict[str, str] = {}
    for ref in refs:
        key = normalize(ref)
        if key:
            wanted.setdefault(key, ref.strip())
    if not wanted:
        raise CourseBlocked("Enter at least one student reference.")

    accounts = {
        normalize(u.student_ref): u
        for u in db.scalars(select(User).where(User.role == Role.STUDENT, User.student_ref.is_not(None)))
    }
    enrolled_ids = set(db.scalars(select(CourseEnrollment.student_id).where(CourseEnrollment.course_id == course.id)))

    added, already, unknown = [], [], []
    for key, typed in wanted.items():
        account = accounts.get(key)
        if account is None:
            unknown.append(typed)
        elif account.id in enrolled_ids:
            already.append(account.student_ref)
        else:
            db.add(CourseEnrollment(course_id=course.id, student_id=account.id))
            enrolled_ids.add(account.id)
            added.append(account.student_ref)
    if added:
        audit(db, user, "course.students_enrolled", course, {"students": added})
    db.commit()
    return EnrollResult(enrolled=added, already_enrolled=already, unknown=unknown, students=students(db, course))


def unenroll(db: Session, course: Course, student_id: uuid.UUID, user: User) -> None:
    """Only a student with no results or plan in the course: removing one would orphan their data."""
    enrollment = db.get(CourseEnrollment, (course.id, student_id))
    if enrollment is None:
        raise LookupError("This student is not enrolled in the course.")
    exam_ids = select(Exam.id).where(Exam.course_id == course.id)
    has_results = db.scalar(
        select(func.count()).where(Submission.student_id == student_id, Submission.exam_id.in_(exam_ids))
    )
    has_plan = db.scalar(
        select(func.count()).where(RecoveryPlan.student_id == student_id, RecoveryPlan.course_id == course.id)
    )
    student = db.get(User, student_id)
    if has_results or has_plan:
        raise CourseBlocked(
            f"{student.student_ref or student.name} already has results in this course, so they can't be removed."
        )
    db.delete(enrollment)
    audit(db, user, "course.student_removed", course, {"student": student.student_ref})
    db.commit()


def _clean(text: str | None) -> str | None:
    text = " ".join((text or "").split())
    return text or None
