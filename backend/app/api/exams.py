import uuid

from fastapi import APIRouter, HTTPException, UploadFile, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession, get_accessible_course, require_course_instructor
from app.models import Exam, ImportBatch, ImportRow, Question
from app.schemas.exam import ExamCreate, ExamDetail, ImportDetail, ImportRowPatch, ImportSummary, QuestionIn
from app.schemas.report import ExamOut
from app.services import exams as exam_service
from app.services import imports as import_service
from app.services.audit import audit
from app.services.exams import ExamBlocked
from app.services.import_validation import ImportFileError
from app.services.imports import ImportBlocked

router = APIRouter(tags=["exams"])

MAX_RESULTS_FILE_MB = 10


# --- exams and questions -----------------------------------------------------------------------


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


@router.post("/courses/{course_id}/exams", response_model=ExamDetail, status_code=status.HTTP_201_CREATED)
def create_exam(course_id: uuid.UUID, body: ExamCreate, user: CurrentUser, db: DbSession) -> ExamDetail:
    course = require_course_instructor(db, user, course_id)
    exam = Exam(course_id=course.id, title=body.title.strip(), exam_date=body.exam_date)
    db.add(exam)
    db.flush()
    audit(db, user, "exam.created", exam, {"title": exam.title})
    db.commit()
    return exam_service.exam_detail(db, exam)


@router.get("/exams/{exam_id}", response_model=ExamDetail)
def get_exam(exam_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ExamDetail:
    """Includes the answer key, so instructors only."""
    return exam_service.exam_detail(db, _instructor_exam(db, user, exam_id))


@router.post("/exams/{exam_id}/questions", response_model=ExamDetail, status_code=status.HTTP_201_CREATED)
def add_question(exam_id: uuid.UUID, body: QuestionIn, user: CurrentUser, db: DbSession) -> ExamDetail:
    exam = _instructor_exam(db, user, exam_id)
    _run(lambda: exam_service.add_question(db, exam, body, user))
    return exam_service.exam_detail(db, exam)


@router.put("/questions/{question_id}", response_model=ExamDetail)
def update_question(question_id: uuid.UUID, body: QuestionIn, user: CurrentUser, db: DbSession) -> ExamDetail:
    q = _question(db, question_id)
    exam = _instructor_exam(db, user, q.exam_id)
    _run(lambda: exam_service.update_question(db, q, body, user))
    return exam_service.exam_detail(db, exam)


@router.delete("/questions/{question_id}", response_model=ExamDetail)
def delete_question(question_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ExamDetail:
    q = _question(db, question_id)
    exam = _instructor_exam(db, user, q.exam_id)
    _run(lambda: exam_service.delete_question(db, q, user))
    return exam_service.exam_detail(db, exam)


@router.post("/exams/{exam_id}/approve-key", response_model=ExamDetail)
def approve_key(exam_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ExamDetail:
    exam = _instructor_exam(db, user, exam_id)
    _run(lambda: exam_service.approve_key(db, exam, user))
    return exam_service.exam_detail(db, exam)


@router.post("/exams/{exam_id}/reopen", response_model=ExamDetail)
def reopen_exam(exam_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ExamDetail:
    exam = _instructor_exam(db, user, exam_id)
    _run(lambda: exam_service.reopen(db, exam, user))
    return exam_service.exam_detail(db, exam)


# --- results imports ---------------------------------------------------------------------------


@router.get("/exams/{exam_id}/imports", response_model=list[ImportSummary])
def list_imports(exam_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[ImportSummary]:
    exam = _instructor_exam(db, user, exam_id)
    batches = db.scalars(select(ImportBatch).where(ImportBatch.exam_id == exam.id).order_by(ImportBatch.created_at.desc()))
    return [import_service.summary(b) for b in batches]


@router.post("/exams/{exam_id}/imports", response_model=ImportDetail, status_code=status.HTTP_201_CREATED)
async def upload_results(exam_id: uuid.UUID, file: UploadFile, user: CurrentUser, db: DbSession) -> ImportDetail:
    """FR-14/FR-15: the file is checked row by row; nothing is official until approved."""
    exam = _instructor_exam(db, user, exam_id)
    data = await file.read(MAX_RESULTS_FILE_MB * 1024 * 1024 + 1)
    if len(data) > MAX_RESULTS_FILE_MB * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"The file is larger than {MAX_RESULTS_FILE_MB} MB.")
    try:
        batch = import_service.create_batch(db, exam, user, file.filename or "results.csv", data)
    except ImportFileError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None
    except ImportBlocked as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
    return import_service.detail(batch)


@router.get("/imports/{import_id}", response_model=ImportDetail)
def get_import(import_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ImportDetail:
    return import_service.detail(_instructor_batch(db, user, import_id))


@router.patch("/imports/{import_id}/rows/{row_id}", response_model=ImportDetail)
def correct_row(import_id: uuid.UUID, row_id: uuid.UUID, body: ImportRowPatch, user: CurrentUser, db: DbSession) -> ImportDetail:
    batch = _instructor_batch(db, user, import_id)
    row = _row(db, batch, row_id)
    _run(lambda: import_service.correct_row(db, batch, row, body.model_dump(), user))
    return import_service.detail(batch)


@router.delete("/imports/{import_id}/rows/{row_id}", response_model=ImportDetail)
def delete_row(import_id: uuid.UUID, row_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ImportDetail:
    batch = _instructor_batch(db, user, import_id)
    row = _row(db, batch, row_id)
    _run(lambda: import_service.delete_row(db, batch, row, user))
    return import_service.detail(batch)


@router.post("/imports/{import_id}/approve", response_model=ImportDetail)
def approve_import(import_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ImportDetail:
    batch = _instructor_batch(db, user, import_id)
    _run(lambda: import_service.approve(db, batch, user))
    return import_service.detail(batch)


@router.post("/imports/{import_id}/reject", response_model=ImportDetail)
def reject_import(import_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ImportDetail:
    batch = _instructor_batch(db, user, import_id)
    _run(lambda: import_service.reject(db, batch, user))
    return import_service.detail(batch)


# --- helpers -----------------------------------------------------------------------------------


def _run(action) -> None:
    try:
        action()
    except (ExamBlocked, ImportBlocked) as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None


def _instructor_exam(db: DbSession, user: CurrentUser, exam_id: uuid.UUID) -> Exam:
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found.")
    require_course_instructor(db, user, exam.course_id)
    return exam


def _question(db: DbSession, question_id: uuid.UUID) -> Question:
    q = db.get(Question, question_id)
    if q is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found.")
    return q


def _instructor_batch(db: DbSession, user: CurrentUser, import_id: uuid.UUID) -> ImportBatch:
    batch = db.get(ImportBatch, import_id)
    if batch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found.")
    _instructor_exam(db, user, batch.exam_id)
    return batch


def _row(db: DbSession, batch: ImportBatch, row_id: uuid.UUID) -> ImportRow:
    row = db.get(ImportRow, row_id)
    if row is None or row.batch_id != batch.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Row not found in this import.")
    return row
