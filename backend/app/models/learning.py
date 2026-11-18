import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import CreatedAtMixin, IdMixin, utcnow
from app.models.enums import BankOrigin, PlanStatus, RetestStatus, ReviewStatus, TaskStatus


class BankQuestion(IdMixin, CreatedAtMixin, Base):
    """Practice and retest questions. Only `approved` ones reach students (BR-11)."""

    __tablename__ = "bank_questions"

    concept_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("concepts.id", ondelete="CASCADE"), index=True)
    source_chunk_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("slide_chunks.id"))
    prompt: Mapped[str] = mapped_column(Text)
    options: Mapped[list[dict]] = mapped_column(JSON, default=list)  # same shape as Question.options
    answer_key: Mapped[str] = mapped_column(String(20))
    usage: Mapped[str] = mapped_column(String(20))  # practice | retest (BR-10: never shared)
    origin: Mapped[str] = mapped_column(String(20), default=BankOrigin.INSTRUCTOR)
    review_status: Mapped[str] = mapped_column(String(20), default=ReviewStatus.PENDING)


class RecoveryPlan(IdMixin, CreatedAtMixin, Base):
    __tablename__ = "recovery_plans"

    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    exam_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default=PlanStatus.ACTIVE)

    tasks: Mapped[list["RecoveryTask"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="RecoveryTask.priority"
    )


class RecoveryTask(IdMixin, Base):
    __tablename__ = "recovery_tasks"

    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recovery_plans.id", ondelete="CASCADE"), index=True)
    concept_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("concepts.id"))
    slide_chunk_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("slide_chunks.id"))
    task_type: Mapped[str] = mapped_column(String(20))
    priority: Mapped[int] = mapped_column(Integer, default=0)  # lower = do first
    status: Mapped[str] = mapped_column(String(20), default=TaskStatus.PENDING)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    plan: Mapped[RecoveryPlan] = relationship(back_populates="tasks")


class Retest(IdMixin, CreatedAtMixin, Base):
    __tablename__ = "retests"

    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recovery_plans.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default=RetestStatus.IN_PROGRESS)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total_score: Mapped[float | None] = mapped_column(Float)

    responses: Mapped[list["RetestResponse"]] = relationship(back_populates="retest", cascade="all, delete-orphan")


class RetestResponse(IdMixin, Base):
    __tablename__ = "retest_responses"

    retest_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("retests.id", ondelete="CASCADE"), index=True)
    bank_question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bank_questions.id"))
    answer: Mapped[str | None] = mapped_column(Text)
    score: Mapped[float | None] = mapped_column(Float)

    retest: Mapped[Retest] = relationship(back_populates="responses")


class ConceptExplanation(Base):
    """Cached LLM explanation of a concept, grounded in its approved slides (FR-38, P1).

    Not student-specific, so one per concept. `source_key` changes when the approved slides
    change, which makes the cached text stale.
    """

    __tablename__ = "concept_explanations"

    concept_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("concepts.id", ondelete="CASCADE"), primary_key=True
    )
    source_key: Mapped[str] = mapped_column(Text)
    content: Mapped[dict] = mapped_column(JSON)  # {"explanation", "key_points", "cited_pages"}
    model: Mapped[str] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(IdMixin, Base):
    __tablename__ = "audit_logs"

    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)  # for the course audit view
    action: Mapped[str] = mapped_column(String(80))  # e.g. "import.approved"
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    details: Mapped[dict | None] = mapped_column(JSON)
    note: Mapped[str | None] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
