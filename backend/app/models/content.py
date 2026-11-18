import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import CreatedAtMixin, IdMixin
from app.models.enums import MappingStatus, MaterialStatus


class Material(IdMixin, CreatedAtMixin, Base):
    __tablename__ = "materials"

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))  # original name, shown to students (FR-32)
    stored_path: Mapped[str] = mapped_column(String(500))  # relative to settings.storage_dir
    file_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default=MaterialStatus.UPLOADED)
    page_count: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)

    chunks: Mapped[list["SlideChunk"]] = relationship(
        back_populates="material", cascade="all, delete-orphan", order_by="SlideChunk.page_number"
    )


class SlideChunk(IdMixin, Base):
    """One page/slide of a material. An `embedding` (pgvector) column is added in P1."""

    __tablename__ = "slide_chunks"
    __table_args__ = (UniqueConstraint("material_id", "page_number"),)

    material_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("materials.id", ondelete="CASCADE"), index=True)
    page_number: Mapped[int] = mapped_column(Integer)  # 1-based, as printed on the slide
    title: Mapped[str | None] = mapped_column(String(300))
    content: Mapped[str] = mapped_column(Text, default="")
    image_path: Mapped[str | None] = mapped_column(String(500))  # relative to settings.storage_dir

    material: Mapped[Material] = relationship(back_populates="chunks")


class Concept(IdMixin, Base):
    __tablename__ = "concepts"

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)


class ConceptSlideChunk(Base):
    """Concept -> slide mapping. RAG suggests, the instructor approves (Section 10.2)."""

    __tablename__ = "concept_slide_chunks"

    concept_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("concepts.id", ondelete="CASCADE"), primary_key=True
    )
    slide_chunk_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("slide_chunks.id", ondelete="CASCADE"), primary_key=True
    )
    mapping_status: Mapped[str] = mapped_column(String(20), default=MappingStatus.SUGGESTED)

    slide_chunk: Mapped[SlideChunk] = relationship()
