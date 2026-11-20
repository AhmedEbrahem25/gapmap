import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.report import SlideRef


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


class ConceptIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class ConceptDetail(ConceptOut):
    """A concept with what depends on it, for the instructor's concept page (FR-09, FR-10)."""

    question_count: int
    slides: list[SlideRef]  # approved slides only: what students see
    practice_count: int  # approved practice items
    retest_count: int  # approved retest items
    pending_count: int  # bank items waiting for review (BR-11)


class SlideSuggestion(BaseModel):
    slide: SlideRef
    score: float  # 0 = no word in common; still listed so any page can be picked
    matched_terms: list[str]  # why it was suggested (FR-34)


class CourseIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=40)
    term: str | None = Field(default=None, max_length=40)


class StudentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    student_ref: str | None
    name: str
    email: str


class EnrollIn(BaseModel):
    student_refs: list[str] = Field(min_length=1, max_length=1000)


class EnrollResult(BaseModel):
    enrolled: list[str]  # newly enrolled references
    already_enrolled: list[str]
    unknown: list[str]  # no student account has this reference (accounts are provisioned separately)
    students: list[StudentOut]  # everyone enrolled now
