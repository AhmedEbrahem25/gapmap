import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MaterialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    filename: str
    file_type: str
    status: str
    page_count: int | None = None
    error: str | None = None
    created_at: datetime


class PageOut(BaseModel):
    material_id: uuid.UUID
    course_id: uuid.UUID
    filename: str
    page_number: int
    page_count: int
    title: str | None
    content: str
    image_url: str | None  # needs the bearer token; the frontend fetches it as a blob
