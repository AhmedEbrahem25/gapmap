import uuid

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession, get_accessible_course
from app.models import Concept, Course, CourseEnrollment, Exam, Material
from app.models.enums import Role
from app.schemas.course import ConceptOut, CourseDetailOut, CourseOut

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


@router.get("/courses/{course_id}", response_model=CourseDetailOut)
def get_course(course_id: uuid.UUID, user: CurrentUser, db: DbSession) -> CourseDetailOut:
    course = get_accessible_course(db, user, course_id)

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
