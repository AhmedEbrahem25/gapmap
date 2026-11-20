import uuid

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession, get_accessible_course, require_course_instructor
from app.models import Concept, Course, CourseEnrollment, Exam, Material
from app.models.enums import Role
from app.schemas.course import (
    ConceptOut,
    CourseDetailOut,
    CourseIn,
    CourseOut,
    EnrollIn,
    EnrollResult,
    StudentOut,
)
from app.services import courses as course_service
from app.services.courses import CourseBlocked

router = APIRouter(tags=["courses"])


def _course_out(course: Course) -> CourseOut:
    return CourseOut(
        id=course.id,
        title=course.title,
        code=course.code,
        term=course.term,
        instructor_name=course.instructor.name,
    )


@router.get("/courses", response_model=list[CourseOut])
def list_courses(user: CurrentUser, db: DbSession) -> list[CourseOut]:
    """Only the courses this user may see (FR-04)."""
    query = select(Course).order_by(Course.title)
    if user.role == Role.INSTRUCTOR:
        query = query.where(Course.instructor_id == user.id)
    elif user.role == Role.STUDENT:
        query = query.join(CourseEnrollment).where(CourseEnrollment.student_id == user.id)
    return [_course_out(c) for c in db.scalars(query)]


@router.post("/courses", response_model=CourseDetailOut, status_code=status.HTTP_201_CREATED)
def create_course(body: CourseIn, user: CurrentUser, db: DbSession) -> CourseDetailOut:
    """FR-05: an instructor (or admin) creates a course they teach."""
    if user.role not in (Role.INSTRUCTOR, Role.ADMIN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only instructors can create courses.")
    course = _run(lambda: course_service.create(db, body, user))
    return _course_detail(db, course)


@router.get("/courses/{course_id}", response_model=CourseDetailOut)
def get_course(course_id: uuid.UUID, user: CurrentUser, db: DbSession) -> CourseDetailOut:
    return _course_detail(db, get_accessible_course(db, user, course_id))


@router.get("/courses/{course_id}/students", response_model=list[StudentOut])
def list_students(course_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[StudentOut]:
    return course_service.students(db, require_course_instructor(db, user, course_id))


@router.post("/courses/{course_id}/enrollments", response_model=EnrollResult)
def enroll_students(course_id: uuid.UUID, body: EnrollIn, user: CurrentUser, db: DbSession) -> EnrollResult:
    """Enrol existing student accounts by reference; unknown references are reported, not created."""
    course = require_course_instructor(db, user, course_id)
    return _run(lambda: course_service.enroll(db, course, body.student_refs, user))


@router.delete("/courses/{course_id}/enrollments/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_student(course_id: uuid.UUID, student_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    course = require_course_instructor(db, user, course_id)
    _run(lambda: course_service.unenroll(db, course, student_id, user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _course_detail(db: DbSession, course: Course) -> CourseDetailOut:
    def count(model, column) -> int:
        return db.scalar(select(func.count()).select_from(model).where(column == course.id)) or 0

    concepts = db.scalars(select(Concept).where(Concept.course_id == course.id).order_by(Concept.name))
    return CourseDetailOut(
        **_course_out(course).model_dump(),
        student_count=count(CourseEnrollment, CourseEnrollment.course_id),
        material_count=count(Material, Material.course_id),
        exam_count=count(Exam, Exam.course_id),
        concepts=[ConceptOut.model_validate(c) for c in concepts],
    )


def _run(action):
    try:
        return action()
    except CourseBlocked as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None
