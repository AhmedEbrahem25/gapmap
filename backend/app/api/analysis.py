import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession, get_accessible_course, require_course_instructor
from app.models import CourseEnrollment, Exam, Question, Submission, User
from app.models.enums import ExamStatus, ImportStatus, Role
from app.schemas.report import AnalysisSummary, ExamOut, StudentReport, StudentResultRow
from app.services.analysis import AnalysisBlocked, build_student_report, class_results, run_analysis

router = APIRouter(tags=["analysis"])


@router.get("/courses/{course_id}/exams", response_model=list[ExamOut])
def list_exams(course_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[ExamOut]:
    course = get_accessible_course(db, user, course_id)
    exams = db.scalars(select(Exam).where(Exam.course_id == course.id).order_by(Exam.exam_date, Exam.title))
    return [
        ExamOut(
            id=e.id,
            course_id=e.course_id,
            title=e.title,
            exam_date=e.exam_date,
            status=e.status,
            question_count=db.scalar(select(func.count()).where(Question.exam_id == e.id)) or 0,
        )
        for e in exams
    ]


@router.post("/exams/{exam_id}/analyze", response_model=AnalysisSummary)
def analyze_exam(exam_id: uuid.UUID, user: CurrentUser, db: DbSession) -> dict:
    exam = _exam(db, exam_id)
    require_course_instructor(db, user, exam.course_id)
    try:
        return run_analysis(db, exam, user)
    except AnalysisBlocked as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None


@router.get("/exams/{exam_id}/results", response_model=list[StudentResultRow])
def exam_results(exam_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[StudentResultRow]:
    """Instructor view of every student's result (student-level data: no coordinators, TC-27)."""
    exam = _exam(db, exam_id)
    require_course_instructor(db, user, exam.course_id)
    if exam.status != ExamStatus.ANALYZED:
        return []
    return class_results(db, exam)


@router.get("/exams/{exam_id}/students/{student_id}/report", response_model=StudentReport)
def student_report_for_instructor(
    exam_id: uuid.UUID, student_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> StudentReport:
    exam = _exam(db, exam_id)
    require_course_instructor(db, user, exam.course_id)  # students and coordinators: 403 (TC-02, TC-27)
    student = db.get(User, student_id)
    report = build_student_report(db, exam, student) if student else None
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No analysed result for this student yet.")
    return report


@router.get("/students/me/reports", response_model=list[StudentReport])
def my_reports(user: CurrentUser, db: DbSession) -> list[StudentReport]:
    """FR-03: always the caller's own data; there is no student id to tamper with."""
    if user.role != Role.STUDENT:
        return []
    exams = db.scalars(
        select(Exam)
        .join(Submission, Submission.exam_id == Exam.id)
        .join(CourseEnrollment, (CourseEnrollment.course_id == Exam.course_id) & (CourseEnrollment.student_id == user.id))
        .where(
            Submission.student_id == user.id,
            Submission.approval_status == ImportStatus.APPROVED,
            Exam.status == ExamStatus.ANALYZED,
        )
        .distinct()
    )
    return [r for e in exams if (r := build_student_report(db, e, user))]


@router.get("/students/me/reports/{exam_id}", response_model=StudentReport)
def my_report(exam_id: uuid.UUID, user: CurrentUser, db: DbSession) -> StudentReport:
    exam = _exam(db, exam_id)
    get_accessible_course(db, user, exam.course_id)
    report = build_student_report(db, exam, user) if user.role == Role.STUDENT else None
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Your report for this exam is not ready yet.")
    return report


def _exam(db: DbSession, exam_id: uuid.UUID) -> Exam:
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found.")
    return exam
