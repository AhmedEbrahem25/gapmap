import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ConceptSlideChunk, Material, SlideChunk
from app.models.enums import MappingStatus
from app.schemas.report import SlideRef

EXCERPT_CHARS = 220


def concept_slides(db: Session, concept_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[SlideRef]]:
    """Instructor-approved slides per concept (plan 7.6). Never invents a source (FR-35)."""
    rows = db.execute(
        select(ConceptSlideChunk.concept_id, SlideChunk, Material.filename)
        .join(SlideChunk, SlideChunk.id == ConceptSlideChunk.slide_chunk_id)
        .join(Material, Material.id == SlideChunk.material_id)
        .where(
            ConceptSlideChunk.concept_id.in_(concept_ids),
            ConceptSlideChunk.mapping_status == MappingStatus.APPROVED,
        )
        .order_by(Material.filename, SlideChunk.page_number)
    )
    slides: dict[uuid.UUID, list[SlideRef]] = {cid: [] for cid in concept_ids}
    for concept_id, chunk, filename in rows:
        slides[concept_id].append(slide_ref(chunk, filename))
    return slides


def slide_ref(chunk: SlideChunk, filename: str) -> SlideRef:
    return SlideRef(
        slide_chunk_id=chunk.id,
        material_id=chunk.material_id,
        filename=filename,
        page_number=chunk.page_number,
        title=chunk.title,
        excerpt=_excerpt(chunk),
    )


def _excerpt(chunk: SlideChunk) -> str:
    body = chunk.content
    if chunk.title and body.startswith(chunk.title):
        body = body[len(chunk.title) :]
    body = " ".join(body.split())
    return body if len(body) <= EXCERPT_CHARS else body[: EXCERPT_CHARS - 1].rstrip() + "…"
