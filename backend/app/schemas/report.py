import uuid
from datetime import date

from pydantic import BaseModel


class SlideRef(BaseModel):
    material_id: uuid.UUID
    filename: str
    page_number: int
    title: str | None
    excerpt: str


class ConceptReport(BaseModel):
    concept_id: uuid.UUID
    name: str
    earned: float
    max: float
    percent: float
    question_count: int
    status: str  # weak | ok | not_enough_data
    slides: list[SlideRef]  # empty = no suitable source found (FR-35)


class QuestionResult(BaseModel):
    question_code: str
    prompt: str
    concept_names: list[str]
    your_answer: str | None
    your_answer_text: str | None
    correct_answer: str
    correct_answer_text: str | None
    score: float
    max_score: float
    likely_cause: str | None  # a hypothesis, never a verdict (BR-07)
    evidence: str | None


class StudentReport(BaseModel):
    exam_id: uuid.UUID
    exam_title: str
    course_id: uuid.UUID
    course_title: str
    student_id: uuid.UUID
    student_name: str
    student_ref: str | None
    earned: float
    max: float
    weak_threshold_percent: float
    concepts: list[ConceptReport]  # weakest first
    questions: list[QuestionResult]


class AnalysisSummary(BaseModel):
    exam_id: uuid.UUID
    students: int
    answers: int
    score_mismatches: int
    weak_threshold_percent: float


class ExamOut(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    exam_date: date | None
    status: str
    question_count: int


class StudentResultRow(BaseModel):
    student_id: uuid.UUID
    student_ref: str | None
    student_name: str
    earned: float
    max: float
    weak_concepts: list[str]
