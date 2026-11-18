import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import ErrorType


class ExamCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    exam_date: date | None = None


class OptionIn(BaseModel):
    key: str = Field(min_length=1, max_length=5)
    text: str = Field(min_length=1)
    error_type: ErrorType | None = None  # what choosing this wrong option suggests


class QuestionIn(BaseModel):
    question_code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9_\-]+$")
    prompt: str = Field(min_length=1)
    options: list[OptionIn] = Field(min_length=2, max_length=8)
    answer_key: str = Field(min_length=1)
    max_score: float = Field(default=1.0, gt=0)
    concept_id: uuid.UUID  # MVP: one primary concept per question (plan Section 12)


class QuestionOut(BaseModel):
    id: uuid.UUID
    question_code: str
    position: int
    prompt: str
    options: list[OptionIn]
    answer_key: str | None
    max_score: float
    concept_id: uuid.UUID | None


class ExamDetail(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    exam_date: date | None
    status: str
    can_reopen: bool  # only while no results are approved
    questions: list[QuestionOut]


class ImportRowOut(BaseModel):
    id: uuid.UUID
    row_number: int
    student_ref: str | None
    question_code: str | None
    answer: str | None
    score: float | None
    errors: list[str]
    warnings: list[str]
    status: str


class ImportRowPatch(BaseModel):
    student_ref: str | None = None
    question_code: str | None = None
    answer: str | None = None
    score: float | None = None
    clear_score: bool = False  # set to remove the score (null cannot mean "remove" above)


class ImportSummary(BaseModel):
    id: uuid.UUID
    exam_id: uuid.UUID
    original_filename: str | None
    status: str
    created_at: datetime
    approved_at: datetime | None
    total_rows: int
    invalid_rows: int
    warning_rows: int
    students: int


class ImportDetail(ImportSummary):
    rows: list[ImportRowOut]
