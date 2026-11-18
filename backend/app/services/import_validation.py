"""Results-file validation (plan 9.6, FR-15). Pure: no database, so every rule is unit tested.

Long Format: one row per (student, question) with columns student_ref, question_id, answer
and an optional score. Errors block approval; warnings are shown but do not.
"""

import io
from dataclasses import dataclass, field

import pandas as pd

from app.services.scoring import QuestionSpec, normalize, score_answer

REQUIRED_COLUMNS = ("student_ref", "question_id", "answer")
OPTIONAL_COLUMNS = ("score",)
MAX_ROWS = 20_000


class ImportFileError(Exception):
    """The whole file is unusable; the message says what to fix."""


@dataclass
class RawRow:
    line: int  # line in the file (header = 1), for messages
    student_ref: str
    question_id: str
    answer: str
    score: str


@dataclass
class RowResult:
    student_ref: str  # canonical (the enrolled student's reference) when known
    question_code: str  # canonical exam code when known
    answer: str  # canonical option key when it matches one
    score: float | None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ValidationContext:
    enrolled_refs: frozenset[str]  # student_ref values of students enrolled in the course
    questions: dict[str, QuestionSpec]  # by question_code


def read_table(filename: str, data: bytes) -> list[RawRow]:
    """Parse a .csv or .xlsx results file. Raises ImportFileError for file-level problems."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    try:
        if ext == "csv":
            frame = _read_csv(data)
        elif ext == "xlsx":
            frame = pd.read_excel(io.BytesIO(data), dtype=str, keep_default_na=False, engine="openpyxl")
        else:
            raise ImportFileError("Upload a .csv or .xlsx file.")
    except ImportFileError:
        raise
    except Exception as exc:
        raise ImportFileError("This file could not be read. Check that it is a valid CSV or Excel file.") from exc

    frame.columns = [str(c).strip().lower() for c in frame.columns]
    missing = [c for c in REQUIRED_COLUMNS if c not in frame.columns]
    if missing:
        raise ImportFileError(
            f"Missing required column(s): {', '.join(missing)}. "
            f"Expected columns: {', '.join(REQUIRED_COLUMNS + OPTIONAL_COLUMNS)} (score is optional)."
        )
    if frame.empty:
        raise ImportFileError("The file has a header but no rows.")
    if len(frame) > MAX_ROWS:
        raise ImportFileError(f"The file has {len(frame)} rows; the limit is {MAX_ROWS}.")

    def cell(row, name: str) -> str:
        return str(row.get(name, "") or "").strip()

    return [
        RawRow(
            line=i + 2,
            student_ref=cell(row, "student_ref"),
            question_id=cell(row, "question_id"),
            answer=cell(row, "answer"),
            score=cell(row, "score"),
        )
        for i, row in enumerate(frame.to_dict("records"))
    ]


def validate_rows(rows: list[RawRow], ctx: ValidationContext) -> list[RowResult]:
    refs = {normalize(r): r for r in ctx.enrolled_refs}
    codes = {normalize(c): c for c in ctx.questions}
    first_seen: dict[tuple[str, str], int] = {}
    results = []

    for row in rows:
        errors: list[str] = []
        warnings: list[str] = []

        ref = refs.get(normalize(row.student_ref), row.student_ref)
        if not row.student_ref:
            errors.append("student_ref is empty.")
        elif normalize(row.student_ref) not in refs:
            errors.append(f'Unknown student "{row.student_ref}": no enrolled student has this reference.')

        code = codes.get(normalize(row.question_id), row.question_id)
        question = ctx.questions.get(code)
        if not row.question_id:
            errors.append("question_id is empty.")
        elif question is None:
            errors.append(f'Unknown question "{row.question_id}". This exam has: {", ".join(ctx.questions)}.')

        answer = row.answer
        if question is not None and row.answer:
            keys = {normalize(o["key"]): o["key"] for o in question.options}
            if normalize(row.answer) in keys:
                answer = keys[normalize(row.answer)]
            else:
                errors.append(f'Answer "{row.answer}" is not an option of {code} ({", ".join(keys.values())}).')
        if not row.answer:
            warnings.append("No answer given; it will count as unanswered.")

        score = None
        if row.score:
            try:
                score = float(row.score)
            except ValueError:
                errors.append(f'Score "{row.score}" is not a number.')
            else:
                if question is not None and not 0 <= score <= question.max_score:
                    errors.append(f"Score {score:g} is outside 0-{question.max_score:g} for {code}.")
                elif question is not None and not errors:
                    computed = score_answer(question, answer)
                    if computed != score:  # TC-22: flag, never overwrite (BR-01)
                        warnings.append(
                            f"The official score {score:g} differs from the answer key result ({computed:g}). "
                            "The official score is kept."
                        )

        if row.student_ref and row.question_id:
            key = (normalize(row.student_ref), normalize(row.question_id))
            if key in first_seen:
                errors.append(f"Duplicate: {ref} already has an answer for {code} on line {first_seen[key]}.")
            else:
                first_seen[key] = row.line

        results.append(RowResult(ref, code, answer, score, errors, warnings))
    return results


def _read_csv(data: bytes) -> pd.DataFrame:
    # Excel on Arabic Windows saves CSV as cp1256; try UTF-8 (with or without BOM) first.
    for encoding in ("utf-8-sig", "cp1256"):
        try:
            return pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False, encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise ImportFileError("The file's text encoding is not supported. Save it as UTF-8 CSV.")
