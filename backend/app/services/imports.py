"""Results import: upload -> validate -> correct -> approve (FR-14..FR-17, FR-22, FR-23)."""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Answer, CourseEnrollment, Exam, ImportBatch, ImportRow, Submission, User
from app.models.base import utcnow
from app.models.enums import ExamStatus, ImportRowStatus, ImportStatus, Role, SourceType
from app.schemas.exam import ImportDetail, ImportRowOut, ImportSummary
from app.services.audit import audit
from app.services.exam_data import question_specs
from app.services.import_validation import RawRow, ValidationContext, read_table, validate_rows


class ImportBlocked(Exception):
    """The action is not allowed in the current state; the message says why."""


def create_batch(db: Session, exam: Exam, user: User, filename: str, data: bytes) -> ImportBatch:
    if exam.status == ExamStatus.DRAFT:
        raise ImportBlocked("Approve the answer key before importing results.")  # BR-02
    raw = read_table(filename, data)  # ImportFileError on file-level problems

    batch = ImportBatch(exam_id=exam.id, uploaded_by=user.id, source_type=SourceType.CSV, original_filename=filename)
    db.add(batch)
    db.flush()
    db.add_all(
        ImportRow(
            batch_id=batch.id, row_number=r.line, student_ref=r.student_ref, question_code=r.question_id,
            answer=r.answer, raw_score=r.score or None,
        )
        for r in raw
    )
    db.flush()
    db.refresh(batch)
    _validate(db, exam, batch)
    audit(db, user, "import.uploaded", batch, {"filename": filename, "rows": len(raw)})
    db.commit()
    return batch


def correct_row(db: Session, batch: ImportBatch, row: ImportRow, changes: dict, user: User) -> None:
    """FR-22: fix a row during verification. The whole batch is re-checked (duplicates span rows)."""
    _require_pending(batch)
    before = _row_values(row)
    for field_name in ("student_ref", "question_code", "answer"):
        if changes.get(field_name) is not None:
            setattr(row, field_name, changes[field_name].strip())
    if changes.get("clear_score"):
        row.raw_score = None
    elif changes.get("score") is not None:
        row.raw_score = f"{changes['score']:g}"
    row.status = ImportRowStatus.CORRECTED  # remembered; turns invalid again if still wrong
    _validate(db, db.get(Exam, batch.exam_id), batch)
    audit(db, user, "import.row_corrected", batch, {"row": row.row_number, "before": before, "after": _row_values(row)})
    db.commit()


def delete_row(db: Session, batch: ImportBatch, row: ImportRow, user: User) -> None:
    _require_pending(batch)
    values = _row_values(row)
    db.delete(row)
    db.flush()
    db.refresh(batch)
    _validate(db, db.get(Exam, batch.exam_id), batch)
    audit(db, user, "import.row_deleted", batch, {"row": values})
    db.commit()


def approve(db: Session, batch: ImportBatch, user: User) -> dict:
    """Creates the official submissions and answers. Nothing is analysed before this (FR-23)."""
    _require_pending(batch)
    invalid = sum(1 for r in batch.rows if r.errors)
    if invalid:
        raise ImportBlocked(f"Fix or delete the {invalid} invalid row(s) before approving.")
    if not batch.rows:
        raise ImportBlocked("This import has no rows left to approve.")
    exam = db.get(Exam, batch.exam_id)
    if exam.status == ExamStatus.DRAFT:
        raise ImportBlocked("Approve the answer key before approving results.")

    students = {u.student_ref: u for u in _enrolled(db, exam)}
    questions = {q.code: q for q in question_specs(db, exam)}
    by_student: dict[str, list[ImportRow]] = {}
    for r in batch.rows:
        by_student.setdefault(r.student_ref, []).append(r)

    # A newer approved import replaces earlier approved results for the same students.
    student_ids = [students[ref].id for ref in by_student]
    replaced = list(
        db.scalars(
            select(Submission.id).where(
                Submission.exam_id == exam.id,
                Submission.student_id.in_(student_ids),
                Submission.approval_status == ImportStatus.APPROVED,
            )
        )
    )
    if replaced:
        db.execute(delete(Submission).where(Submission.id.in_(replaced)))

    for ref, rows in by_student.items():
        submission = Submission(
            exam_id=exam.id, student_id=students[ref].id, import_batch_id=batch.id,
            source_type=batch.source_type, approval_status=ImportStatus.APPROVED,
        )
        db.add(submission)
        db.flush()
        db.add_all(
            Answer(
                submission_id=submission.id, question_id=questions[r.question_code].id,
                answer_text=r.answer or None, official_score=r.score, verified=True,
            )
            for r in rows
        )

    batch.status = ImportStatus.APPROVED
    batch.approved_by = user.id
    batch.approved_at = utcnow()
    if exam.status == ExamStatus.ANALYZED:
        exam.status = ExamStatus.KEY_APPROVED  # results changed: analysis must run again
    details = {"rows": len(batch.rows), "students": len(by_student), "replaced_submissions": len(replaced)}
    audit(db, user, "import.approved", batch, details)
    db.commit()
    return details


def reject(db: Session, batch: ImportBatch, user: User) -> None:
    _require_pending(batch)
    batch.status = ImportStatus.REJECTED
    audit(db, user, "import.rejected", batch, {"rows": len(batch.rows)})
    db.commit()


def summary(batch: ImportBatch) -> ImportSummary:
    return ImportSummary(**_summary_fields(batch))


def detail(batch: ImportBatch) -> ImportDetail:
    return ImportDetail(
        **_summary_fields(batch),
        rows=[
            ImportRowOut(
                id=r.id, row_number=r.row_number, student_ref=r.student_ref, question_code=r.question_code,
                answer=r.answer, score=r.score, errors=r.errors or [], warnings=r.warnings or [], status=r.status,
            )
            for r in batch.rows
        ],
    )


# --- helpers -----------------------------------------------------------------------------------


def _validate(db: Session, exam: Exam, batch: ImportBatch) -> None:
    ctx = ValidationContext(
        enrolled_refs=frozenset(u.student_ref for u in _enrolled(db, exam) if u.student_ref),
        questions={q.code: q for q in question_specs(db, exam)},
    )
    rows = sorted(batch.rows, key=lambda r: r.row_number)
    raw = [
        RawRow(
            line=r.row_number,
            student_ref=r.student_ref or "",
            question_id=r.question_code or "",
            answer=r.answer or "",
            score=r.raw_score or "",
        )
        for r in rows
    ]
    for row, result in zip(rows, validate_rows(raw, ctx), strict=True):
        row.student_ref, row.question_code, row.answer = result.student_ref, result.question_code, result.answer
        row.score = result.score
        row.errors, row.warnings = result.errors, result.warnings
        if result.errors:
            row.status = ImportRowStatus.INVALID
        elif row.status != ImportRowStatus.CORRECTED:
            row.status = ImportRowStatus.VALID


def _enrolled(db: Session, exam: Exam) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
            .where(CourseEnrollment.course_id == exam.course_id, User.role == Role.STUDENT)
        )
    )


def _require_pending(batch: ImportBatch) -> None:
    if batch.status != ImportStatus.PENDING_REVIEW:
        raise ImportBlocked(f"This import is already {batch.status.replace('_', ' ')}.")


def _row_values(row: ImportRow) -> dict:
    return {"student_ref": row.student_ref, "question_code": row.question_code, "answer": row.answer, "score": row.score}


def _summary_fields(batch: ImportBatch) -> dict:
    return {
        "id": batch.id,
        "exam_id": batch.exam_id,
        "original_filename": batch.original_filename,
        "status": batch.status,
        "created_at": batch.created_at,
        "approved_at": batch.approved_at,
        "total_rows": len(batch.rows),
        "invalid_rows": sum(1 for r in batch.rows if r.errors),
        "warning_rows": sum(1 for r in batch.rows if r.warnings and not r.errors),
        "students": len({r.student_ref for r in batch.rows if r.student_ref}),
    }
