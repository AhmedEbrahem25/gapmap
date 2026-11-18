"""Creates the full demo state. See app/seed/__main__.py for the CLI."""

import csv
import shutil
from datetime import UTC, date, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import (
    Answer,
    AuditLog,
    BankQuestion,
    Concept,
    ConceptSlideChunk,
    Course,
    CourseEnrollment,
    Exam,
    ImportBatch,
    ImportRow,
    Material,
    Question,
    QuestionConcept,
    SlideChunk,
    Submission,
    User,
)
from app.models.enums import (
    BankOrigin,
    ExamStatus,
    ImportRowStatus,
    ImportStatus,
    MappingStatus,
    ReviewStatus,
    Role,
    SourceType,
)
from app.seed import demo_content as dc
from app.seed.generate_results import RESULTS_FILENAME
from app.seed.lecture_pdf import LECTURE_FILENAME, build_lecture_pdf
from app.services.pdf_ingest import ingest_pdf


def seed_demo(db: Session, *, with_results: bool = True, results_csv: Path | None = None) -> dict:
    """Populate an EMPTY database. Returns ids and counts useful for tests and the CLI summary."""
    password_hash = hash_password(settings.demo_password)  # one hash shared by all demo accounts

    def user(name: str, email: str, role: Role, ref: str | None = None) -> User:
        u = User(name=name, email=email, role=role, student_ref=ref, password_hash=password_hash)
        db.add(u)
        return u

    instructor = user(*dc.INSTRUCTOR, Role.INSTRUCTOR)
    other_instructor = user(*dc.OTHER_INSTRUCTOR, Role.INSTRUCTOR)
    user(*dc.ADMIN, Role.ADMIN)
    user(*dc.COORDINATOR, Role.COORDINATOR)
    students = [
        user(name, f"{dc.student_ref(i).lower()}@gapmap.test", Role.STUDENT, dc.student_ref(i))
        for i, name in enumerate(dc.STUDENT_NAMES, start=1)
    ]
    db.flush()

    course = Course(instructor_id=instructor.id, **dc.COURSE)
    other_course = Course(instructor_id=other_instructor.id, title="Database Systems", code="CS204", term="Fall 2026")
    db.add_all([course, other_course])
    db.flush()
    db.add_all(CourseEnrollment(course_id=course.id, student_id=s.id) for s in students)

    # Lecture material -> slide chunks (same code path as the S1 upload endpoint)
    material = Material(course_id=course.id, filename=LECTURE_FILENAME, stored_path="", file_type="pdf")
    db.add(material)
    db.flush()
    material.stored_path = f"materials/{material.id}/{LECTURE_FILENAME}"
    build_lecture_pdf(settings.storage_dir / material.stored_path)
    ingest_pdf(db, material)
    pages = {c.page_number: c for c in db.query(SlideChunk).filter_by(material_id=material.id)}

    concepts: dict[str, Concept] = {}
    for key, (name, description, slide_pages) in dc.CONCEPTS.items():
        concept = Concept(course_id=course.id, name=name, description=description)
        db.add(concept)
        db.flush()
        concepts[key] = concept
        db.add_all(
            ConceptSlideChunk(
                concept_id=concept.id, slide_chunk_id=pages[p].id, mapping_status=MappingStatus.APPROVED
            )
            for p in slide_pages
        )

    exam = Exam(
        course_id=course.id,
        title=dc.EXAM["title"],
        exam_date=date.fromisoformat(dc.EXAM["exam_date"]),
        status=ExamStatus.KEY_APPROVED,
    )
    db.add(exam)
    db.flush()
    questions: dict[str, Question] = {}
    for position, (code, concept_key, prompt, options, key) in enumerate(dc.QUESTIONS, start=1):
        q = Question(
            exam_id=exam.id, question_code=code, position=position, prompt=prompt,
            options=options, answer_key=key, max_score=1.0,
        )
        db.add(q)
        db.flush()
        db.add(QuestionConcept(question_id=q.id, concept_id=concepts[concept_key].id, weight=1.0))
        questions[code] = q

    for concept_key, usage, page, prompt, options, key in dc.BANK:
        db.add(BankQuestion(
            concept_id=concepts[concept_key].id, source_chunk_id=pages[page].id, prompt=prompt,
            options=options, answer_key=key, usage=usage,
            origin=BankOrigin.INSTRUCTOR, review_status=ReviewStatus.APPROVED,
        ))
    concept_key, usage, page, prompt, options, key = dc.PENDING_AI_BANK
    db.add(BankQuestion(
        concept_id=concepts[concept_key].id, source_chunk_id=pages[page].id, prompt=prompt,
        options=options, answer_key=key, usage=usage,
        origin=BankOrigin.AI, review_status=ReviewStatus.PENDING,
    ))

    answer_count = 0
    if with_results:
        csv_path = results_csv or settings.data_dir / "sample" / RESULTS_FILENAME
        answer_count = _import_approved_results(db, exam, instructor, students, questions, csv_path)

    db.commit()
    return {
        "course_id": course.id,
        "other_course_id": other_course.id,
        "exam_id": exam.id,
        "material_id": material.id,
        "students": len(students),
        "slides": len(pages),
        "answers": answer_count,
    }


def _import_approved_results(db, exam, instructor, students, questions, csv_path: Path) -> int:
    """Shortcut so analysis work (S3) can start before the CSV import UI (S2) exists.

    Writes the same rows S2 will produce after an instructor approves an import.
    Validation is skipped: the sample file is generated and known-good.
    """
    with csv_path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    now = datetime.now(UTC)
    batch = ImportBatch(
        exam_id=exam.id, uploaded_by=instructor.id, source_type=SourceType.CSV,
        original_filename=csv_path.name, status=ImportStatus.APPROVED,
        approved_by=instructor.id, approved_at=now,
    )
    db.add(batch)
    db.flush()

    by_ref = {s.student_ref: s for s in students}
    submissions: dict[str, Submission] = {}
    for line, row in enumerate(rows, start=2):  # line 1 is the header
        score = float(row["score"]) if row.get("score") not in (None, "") else None
        db.add(ImportRow(
            batch_id=batch.id, row_number=line, student_ref=row["student_ref"],
            question_code=row["question_id"], answer=row["answer"], score=score,
            raw_score=row.get("score") or None, errors=[], warnings=[], status=ImportRowStatus.VALID,
        ))
        ref = row["student_ref"]
        if ref not in submissions:
            submissions[ref] = Submission(
                exam_id=exam.id, student_id=by_ref[ref].id, import_batch_id=batch.id,
                source_type=SourceType.CSV, approval_status=ImportStatus.APPROVED,
            )
            db.add(submissions[ref])
            db.flush()
        db.add(Answer(
            submission_id=submissions[ref].id, question_id=questions[row["question_id"]].id,
            answer_text=row["answer"], official_score=score, computed_score=None, verified=True,
        ))

    db.add(AuditLog(
        actor_id=instructor.id, action="import.approved", target_type="import_batch",
        target_id=batch.id, details={"rows": len(rows)}, note="Created by the demo seed script",
    ))
    return len(rows)


def clear_storage() -> None:
    materials = settings.storage_dir / "materials"
    if materials.exists():
        shutil.rmtree(materials)
