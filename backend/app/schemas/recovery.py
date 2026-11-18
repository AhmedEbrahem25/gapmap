import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.report import SlideRef


class TaskOut(BaseModel):
    id: uuid.UUID
    task_type: str  # review_slide | practice
    status: str  # pending | completed
    slide: SlideRef | None = None


class PlanConcept(BaseModel):
    concept_id: uuid.UUID
    name: str
    percent_before: float
    practice_count: int
    tasks: list[TaskOut]


class RetestSummary(BaseModel):
    id: uuid.UUID
    status: str
    submitted_at: datetime | None
    total_score: float | None
    max_score: float


class RecoveryPlanOut(BaseModel):
    id: uuid.UUID
    exam_id: uuid.UUID
    exam_title: str
    course_id: uuid.UUID
    status: str
    concepts: list[PlanConcept]  # weakest first
    retest_question_count: int
    retests: list[RetestSummary]  # newest first


class BankOption(BaseModel):
    key: str
    text: str


class BankQuestionOut(BaseModel):
    """A practice or retest question as students see it: never with the answer key."""

    id: uuid.UUID
    concept_id: uuid.UUID
    prompt: str
    options: list[BankOption]


class PracticeCheckIn(BaseModel):
    answer: str


class PracticeCheckOut(BaseModel):
    correct: bool
    correct_answer: str
    correct_answer_text: str | None
    source: SlideRef | None


class RetestCreate(BaseModel):
    recovery_plan_id: uuid.UUID


class RetestOut(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    status: str
    questions: list[BankQuestionOut]


class RetestSubmit(BaseModel):
    answers: dict[uuid.UUID, str]  # bank_question_id -> chosen option key


class RetestQuestionResult(BaseModel):
    bank_question_id: uuid.UUID
    concept_name: str
    prompt: str
    your_answer: str | None
    correct_answer: str
    correct_answer_text: str | None
    correct: bool


class ConceptGain(BaseModel):
    concept_id: uuid.UUID
    name: str
    before_percent: float
    before_question_count: int
    after_percent: float
    after_question_count: int
    gain_points: float  # percentage points, after - before


class RetestResults(BaseModel):
    retest_id: uuid.UUID
    plan_id: uuid.UUID
    submitted_at: datetime
    total_score: float
    max_score: float
    concepts: list[ConceptGain]
    questions: list[RetestQuestionResult]
    note: str
