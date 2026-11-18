import uuid

from pydantic import BaseModel


class OptionCount(BaseModel):
    key: str
    text: str
    count: int
    is_correct: bool
    error_type: str | None  # the instructor's tag on this wrong option


class QuestionStat(BaseModel):
    question_code: str
    prompt: str
    concept_names: list[str]
    responses: int
    incorrect: int
    error_rate: float  # percent
    options: list[OptionCount]
    top_wrong: OptionCount | None


class ConceptStat(BaseModel):
    concept_id: uuid.UUID
    name: str
    question_count: int
    responses: int
    incorrect: int
    error_rate: float  # incorrect / responses x 100 (plan Section 12)
    students_measured: int
    students_weak: int  # below the weak threshold with enough questions


class ReteachSuggestion(BaseModel):
    concept_id: uuid.UUID
    name: str
    error_rate: float
    evidence: list[str]  # FR-47: every suggestion says why


class ExamRef(BaseModel):
    id: uuid.UUID
    title: str
    status: str


class ClassAnalytics(BaseModel):
    course_id: uuid.UUID
    exam: ExamRef | None  # None when the course has no exam with approved results
    exams: list[ExamRef]
    student_count: int
    weak_threshold_percent: float
    reteach_threshold_percent: float
    concepts: list[ConceptStat]  # highest error rate first
    questions: list[QuestionStat]  # exam order
    reteach: list[ReteachSuggestion]
