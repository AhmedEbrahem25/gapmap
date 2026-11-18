import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import CreatedAtMixin, IdMixin
from app.models.enums import ExamStatus, ImportRowStatus, ImportStatus, QuestionType, SourceType


class Exam(IdMixin, CreatedAtMixin, Base):
    __tablename__ = "exams"

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    exam_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default=ExamStatus.DRAFT)

    questions: Mapped[list["Question"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan", order_by="Question.position"
    )


class Question(IdMixin, Base):
    __tablename__ = "questions"
    __table_args__ = (UniqueConstraint("exam_id", "question_code"),)

    exam_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), index=True)
    question_code: Mapped[str] = mapped_column(String(20))  # "Q1" — the id used in the CSV
    position: Mapped[int] = mapped_column(Integer, default=0)
    prompt: Mapped[str] = mapped_column(Text)
    question_type: Mapped[str] = mapped_column(String(20), default=QuestionType.MCQ)
    # [{"key": "A", "text": "...", "error_type": "conceptual" | null}]
    # `error_type` on a wrong option is the instructor's tag for what choosing it suggests
    # (docs/decisions/0001, section 2). Untagged wrong options diagnose as "unknown".
    options: Mapped[list[dict]] = mapped_column(JSON, default=list)
    max_score: Mapped[float] = mapped_column(Float, default=1.0)
    answer_key: Mapped[str | None] = mapped_column(String(20))

    exam: Mapped[Exam] = relationship(back_populates="questions")
    concepts: Mapped[list["QuestionConcept"]] = relationship(cascade="all, delete-orphan")


class QuestionConcept(Base):
    __tablename__ = "question_concepts"

    question_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True
    )
    concept_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("concepts.id", ondelete="CASCADE"), primary_key=True
    )
    weight: Mapped[float] = mapped_column(Float, default=1.0)


class ImportBatch(IdMixin, CreatedAtMixin, Base):
    __tablename__ = "import_batches"

    exam_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), index=True)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    source_type: Mapped[str] = mapped_column(String(20), default=SourceType.CSV)
    original_filename: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default=ImportStatus.PENDING_REVIEW)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    rows: Mapped[list["ImportRow"]] = relationship(
        back_populates="batch", cascade="all, delete-orphan", order_by="ImportRow.row_number"
    )


class ImportRow(IdMixin, Base):
    """Staging row for verification (FR-15, FR-22). Not in the plan's ERD; see docs/decisions/0001, section 1.

    Submissions and answers are created from these rows only when the batch is approved,
    so analysis can never read unapproved data (FR-23).
    """

    __tablename__ = "import_rows"

    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("import_batches.id", ondelete="CASCADE"), index=True)
    row_number: Mapped[int] = mapped_column(Integer)  # line in the source file, for error messages
    student_ref: Mapped[str | None] = mapped_column(String(40))
    question_code: Mapped[str | None] = mapped_column(String(20))
    answer: Mapped[str | None] = mapped_column(String(50))
    score: Mapped[float | None] = mapped_column(Float)
    errors: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default=ImportRowStatus.VALID)

    batch: Mapped[ImportBatch] = relationship(back_populates="rows")


class Submission(IdMixin, Base):
    __tablename__ = "submissions"

    exam_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("import_batches.id"))
    source_type: Mapped[str] = mapped_column(String(20), default=SourceType.CSV)
    approval_status: Mapped[str] = mapped_column(String(20), default=ImportStatus.PENDING_REVIEW)

    answers: Mapped[list["Answer"]] = relationship(back_populates="submission", cascade="all, delete-orphan")


class Answer(IdMixin, Base):
    __tablename__ = "answers"

    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id"), index=True)
    answer_text: Mapped[str | None] = mapped_column(Text)
    # Never mix these two (BR-01): official comes from the instructor, computed from the system.
    official_score: Mapped[float | None] = mapped_column(Float)
    computed_score: Mapped[float | None] = mapped_column(Float)
    confidence: Mapped[float | None] = mapped_column(Float)  # OCR path only
    verified: Mapped[bool] = mapped_column(Boolean, default=False)

    submission: Mapped[Submission] = relationship(back_populates="answers")
    question: Mapped[Question] = relationship()


class Diagnosis(IdMixin, Base):
    __tablename__ = "diagnoses"

    answer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("answers.id", ondelete="CASCADE"), unique=True)
    error_type: Mapped[str] = mapped_column(String(30))
    confidence: Mapped[float | None] = mapped_column(Float)
    evidence: Mapped[str | None] = mapped_column(Text)
