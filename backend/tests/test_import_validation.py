import io
import uuid

import pandas as pd
import pytest

from app.services.import_validation import ImportFileError, RawRow, ValidationContext, read_table, validate_rows
from app.services.scoring import QuestionSpec

OPTS = [{"key": "A", "text": "a"}, {"key": "B", "text": "b"}, {"key": "C", "text": "c"}]
CTX = ValidationContext(
    enrolled_refs=frozenset({"STU001", "STU002"}),
    questions={
        "Q1": QuestionSpec(uuid.uuid4(), "Q1", 1.0, "B", OPTS),
        "Q2": QuestionSpec(uuid.uuid4(), "Q2", 2.0, "A", OPTS),
    },
)


def row(ref="STU001", q="Q1", answer="B", score="", line=2):
    return RawRow(line, ref, q, answer, score)


def one(**kw):
    return validate_rows([row(**kw)], CTX)[0]


def test_valid_row_is_normalised():
    r = one(ref=" stu001", q="q1", answer="b", score="1")
    assert r.errors == [] and r.warnings == []
    assert (r.student_ref, r.question_code, r.answer, r.score) == ("STU001", "Q1", "B", 1.0)


def test_empty_and_unknown_student():
    assert one(ref="").errors == ["student_ref is empty."]
    assert "Unknown student" in one(ref="STU999").errors[0]


def test_tc07_unknown_question_lists_valid_codes():
    err = one(q="Q9").errors[0]
    assert 'Unknown question "Q9"' in err and "Q1, Q2" in err


def test_tc21_answer_outside_options():
    assert 'Answer "E" is not an option of Q1 (A, B, C)' in one(answer="E").errors[0]


def test_blank_answer_is_a_warning_not_an_error():
    r = one(answer="")
    assert r.errors == [] and "unanswered" in r.warnings[0]


def test_score_must_be_a_number_within_range():
    assert "not a number" in one(score="abc").errors[0]
    assert "outside 0-1" in one(score="3").errors[0]
    assert one(q="Q2", answer="A", score="2").errors == []


def test_tc22_score_mismatch_is_flagged_and_kept():
    r = one(answer="C", score="1")  # wrong answer, but the instructor gave 1
    assert r.errors == [] and r.score == 1.0
    assert "differs from the answer key result (0)" in r.warnings[0]


def test_tc08_duplicates_are_flagged_after_the_first():
    results = validate_rows([row(line=2), row(line=3, answer="A"), row(ref="stu001", q="q1", line=4)], CTX)
    assert results[0].errors == []
    assert "Duplicate" in results[1].errors[0] and "line 2" in results[1].errors[0]
    assert "Duplicate" in results[2].errors[0]


def test_read_csv_with_bom_and_case_insensitive_headers():
    data = "﻿Student_Ref,Question_ID,Answer\nSTU001,Q1,B\n".encode()
    rows = read_table("r.csv", data)
    assert rows == [RawRow(2, "STU001", "Q1", "B", "")]


def test_read_cp1256_csv():
    data = "student_ref,question_id,answer,score\nSTU001,Q1,ب,0\n".encode("cp1256")
    assert read_table("r.csv", data)[0].answer == "ب"


def test_read_xlsx():
    buf = io.BytesIO()
    pd.DataFrame({"student_ref": ["STU001"], "question_id": ["Q1"], "answer": ["B"], "score": [1]}).to_excel(buf, index=False)
    rows = read_table("r.xlsx", buf.getvalue())
    assert rows[0].student_ref == "STU001" and float(rows[0].score) == 1.0


@pytest.mark.parametrize(
    ("name", "data", "message"),
    [
        ("r.csv", b"question_id,answer\nQ1,B\n", "Missing required column(s): student_ref"),  # TC-06
        ("r.csv", b"student_ref,question_id,answer\n", "no rows"),
        ("r.txt", b"x", "Upload a .csv or .xlsx file"),
        ("r.xlsx", b"not excel", "could not be read"),
    ],
)
def test_file_level_errors(name, data, message):
    with pytest.raises(ImportFileError, match=message.replace("(", r"\(").replace(")", r"\)")):
        read_table(name, data)
