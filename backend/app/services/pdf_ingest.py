"""PDF -> one SlideChunk per page, with a rendered page image (FR-07, FR-33).

Used by the seed script now and by the material upload endpoint in S1.
"""

from pathlib import Path

import pymupdf
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Material, SlideChunk
from app.models.enums import MaterialStatus

PAGE_IMAGE_DPI = 110


def ingest_pdf(db: Session, material: Material) -> None:
    """Extract text and render every page. Sets `material.status`; never raises on a bad PDF."""
    material.status = MaterialStatus.PROCESSING
    db.flush()
    pdf_path = settings.storage_dir / material.stored_path
    pages_dir = Path(material.stored_path).parent / "pages"
    (settings.storage_dir / pages_dir).mkdir(parents=True, exist_ok=True)

    try:
        with pymupdf.open(pdf_path) as doc:
            for index, page in enumerate(doc):
                page_number = index + 1
                text = page.get_text("text").strip()
                image_rel = pages_dir / f"{page_number}.png"
                page.get_pixmap(dpi=PAGE_IMAGE_DPI).save(settings.storage_dir / image_rel)
                db.add(
                    SlideChunk(
                        material_id=material.id,
                        page_number=page_number,
                        title=_first_line(text),
                        content=text,
                        image_path=image_rel.as_posix(),
                    )
                )
            material.page_count = doc.page_count
        material.status = MaterialStatus.READY
        material.error = None
    except Exception as exc:  # corrupt or encrypted PDF: report it, keep the app running
        material.status = MaterialStatus.FAILED
        material.error = f"Could not read this PDF: {exc}"
    db.flush()


def _first_line(text: str) -> str | None:
    for line in text.splitlines():
        if line.strip():
            return line.strip()[:300]
    return None
