import uuid

from pydantic import BaseModel, ConfigDict


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    code: str | None = None
    term: str | None = None
    instructor_name: str


class ConceptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None = None


class CourseDetailOut(CourseOut):
    student_count: int
    material_count: int
    exam_count: int
    concepts: list[ConceptOut]
