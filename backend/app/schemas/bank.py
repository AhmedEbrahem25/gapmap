import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.recovery import BankOption
from app.schemas.report import SlideRef


class BankOptionIn(BaseModel):
    key: str = Field(min_length=1, max_length=5)
    text: str = Field(min_length=1)


class BankItemIn(BaseModel):
    usage: Literal["practice", "retest"]
    prompt: str = Field(min_length=1)
    options: list[BankOptionIn] = Field(min_length=2, max_length=8)
    answer_key: str = Field(min_length=1)
    source_chunk_id: uuid.UUID | None = None  # the slide that explains the answer


class BankItemOut(BaseModel):
    """A question-bank item as the instructor sees it: with the answer key and review state."""

    id: uuid.UUID
    usage: str  # practice | retest (BR-10: never both)
    prompt: str
    options: list[BankOption]
    answer_key: str
    origin: str  # instructor | ai
    review_status: str  # pending | approved; only approved items reach students (BR-11)
    source: SlideRef | None
    used_in_retests: int  # retests that drew this item; such items can't be edited or deleted
    created_at: datetime


class BankOverview(BaseModel):
    concept_id: uuid.UUID
    concept_name: str
    course_id: uuid.UUID
    retest_questions_per_concept: int
    slides: list[SlideRef]  # the concept's approved slides, to pick an item's source from
    items: list[BankItemOut]
