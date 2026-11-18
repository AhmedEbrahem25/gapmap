import uuid

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import CreatedAtMixin, IdMixin


class User(IdMixin, CreatedAtMixin, Base):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), index=True)
    # Pseudonymous reference used in CSV imports (NFR-02). Students only.
    student_ref: Mapped[str | None] = mapped_column(String(40), unique=True, index=True)


class Course(IdMixin, CreatedAtMixin, Base):
    __tablename__ = "courses"

    instructor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    code: Mapped[str | None] = mapped_column(String(40))
    term: Mapped[str | None] = mapped_column(String(40))

    instructor: Mapped[User] = relationship()
    enrollments: Mapped[list["CourseEnrollment"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )


class CourseEnrollment(Base):
    __tablename__ = "course_enrollments"

    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    course: Mapped[Course] = relationship(back_populates="enrollments")
    student: Mapped[User] = relationship()
