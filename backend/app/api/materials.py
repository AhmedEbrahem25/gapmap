import re
import uuid

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, get_accessible_course, require_course_instructor
from app.models import Material, SlideChunk
from app.schemas.material import MaterialOut, PageOut
from app.services.audit import audit
from app.services.pdf_ingest import ingest_pdf

router = APIRouter(tags=["materials"])

_CHUNK = 1024 * 1024


@router.get("/courses/{course_id}/materials", response_model=list[MaterialOut])
def list_materials(course_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[Material]:
    course = get_accessible_course(db, user, course_id)
    return list(db.scalars(select(Material).where(Material.course_id == course.id).order_by(Material.created_at)))


@router.post("/courses/{course_id}/materials", response_model=MaterialOut, status_code=status.HTTP_201_CREATED)
async def upload_material(course_id: uuid.UUID, file: UploadFile, user: CurrentUser, db: DbSession) -> Material:
    """FR-06/FR-07. PDF only in the MVP; processed inside the request (docs/decisions/0001)."""
    course = require_course_instructor(db, user, course_id)
    filename = _safe_filename(file.filename or "lecture.pdf")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only PDF files are supported. Export slides to PDF first.")

    data = await _read_limited(file)
    if not data.startswith(b"%PDF"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This file is not a valid PDF.")

    material = Material(course_id=course.id, filename=filename, stored_path="", file_type="pdf")
    db.add(material)
    db.flush()
    material.stored_path = f"materials/{material.id}/{filename}"
    target = settings.storage_dir / material.stored_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

    ingest_pdf(db, material)
    audit(db, user, "material.uploaded", material, {"filename": filename, "status": material.status})
    db.commit()
    return material


@router.get("/materials/{material_id}/status", response_model=MaterialOut)
def material_status(material_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Material:
    return _accessible_material(db, user, material_id)


@router.get("/materials/{material_id}/pages/{page_number}", response_model=PageOut)
def get_page(material_id: uuid.UUID, page_number: int, user: CurrentUser, db: DbSession) -> PageOut:
    """FR-32/FR-33: the real file name, page number, text and image."""
    material = _accessible_material(db, user, material_id)
    chunk = _chunk(db, material, page_number)
    return PageOut(
        material_id=material.id,
        course_id=material.course_id,
        filename=material.filename,
        page_number=chunk.page_number,
        page_count=material.page_count or 0,
        title=chunk.title,
        content=chunk.content,
        image_url=f"/api/materials/{material.id}/pages/{chunk.page_number}/image" if chunk.image_path else None,
    )


@router.get("/materials/{material_id}/pages/{page_number}/image", response_class=FileResponse)
def get_page_image(material_id: uuid.UUID, page_number: int, user: CurrentUser, db: DbSession) -> FileResponse:
    material = _accessible_material(db, user, material_id)
    chunk = _chunk(db, material, page_number)
    path = settings.storage_dir / chunk.image_path if chunk.image_path else None
    if path is None or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No image for this page.")
    return FileResponse(path, media_type="image/png")


def _accessible_material(db: DbSession, user: CurrentUser, material_id: uuid.UUID) -> Material:
    material = db.get(Material, material_id)
    if material is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Material not found.")
    get_accessible_course(db, user, material.course_id)
    return material


def _chunk(db: DbSession, material: Material, page_number: int) -> SlideChunk:
    chunk = db.scalar(
        select(SlideChunk).where(SlideChunk.material_id == material.id, SlideChunk.page_number == page_number)
    )
    if chunk is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Page {page_number} does not exist in {material.filename}.")
    return chunk


async def _read_limited(file: UploadFile) -> bytes:
    limit = settings.max_upload_mb * _CHUNK
    data = bytearray()
    while chunk := await file.read(_CHUNK):
        data += chunk
        if len(data) > limit:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"The file is larger than the {settings.max_upload_mb} MB limit."
            )
    return bytes(data)


def _safe_filename(name: str) -> str:
    # Keep the original name readable for students, but never let it pick a path.
    base = name.replace("\\", "/").rsplit("/", 1)[-1]
    base = re.sub(r"[^\w.\- ]", "_", base).strip(" .")
    return base[:200] or "lecture.pdf"
