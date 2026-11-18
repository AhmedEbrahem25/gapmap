"""String enums stored as plain strings, so the schema works on Postgres and SQLite."""

from enum import StrEnum


class Role(StrEnum):
    ADMIN = "admin"
    INSTRUCTOR = "instructor"
    STUDENT = "student"
    COORDINATOR = "coordinator"


class MaterialStatus(StrEnum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class MappingStatus(StrEnum):
    SUGGESTED = "suggested"
    APPROVED = "approved"


class ExamStatus(StrEnum):
    DRAFT = "draft"
    KEY_APPROVED = "key_approved"  # BR-02: evaluation needs an approved key
    ANALYZED = "analyzed"


class QuestionType(StrEnum):
    MCQ = "mcq"


class ErrorType(StrEnum):
    """FR-28. `UNKNOWN` is always allowed (BR-07)."""

    CONCEPTUAL = "conceptual"
    FORMULA_APPLICATION = "formula_application"
    CALCULATION = "calculation"
    MISSING_PREREQUISITE = "missing_prerequisite"
    INCOMPLETE_ANSWER = "incomplete_answer"
    UNKNOWN = "unknown"


class ImportStatus(StrEnum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"


class ImportRowStatus(StrEnum):
    VALID = "valid"
    INVALID = "invalid"
    CORRECTED = "corrected"


class SourceType(StrEnum):
    CSV = "csv"
    OCR = "ocr"


class BankUsage(StrEnum):
    PRACTICE = "practice"
    RETEST = "retest"


class BankOrigin(StrEnum):
    INSTRUCTOR = "instructor"
    AI = "ai"


class ReviewStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"


class PlanStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"


class TaskType(StrEnum):
    REVIEW_SLIDE = "review_slide"
    PRACTICE = "practice"
    RETEST = "retest"


class TaskStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"


class RetestStatus(StrEnum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
