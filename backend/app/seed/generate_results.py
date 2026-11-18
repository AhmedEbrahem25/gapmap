"""Writes data/sample/exam1_results.csv (Long Format, plan Section 9.6). Deterministic.

Story (plan Section 18): STU001 misses Q1, Q2 (Agile) and Q4, Q5 (Scrum Roles); most of the
class misses Scrum Roles, usually by confusing the Scrum Master with a manager (option A).

Run: python -m app.seed.generate_results
"""

import csv
import random
from pathlib import Path

from app.core.config import settings
from app.seed.demo_content import QUESTIONS, STUDENT_NAMES, student_ref

RESULTS_FILENAME = "exam1_results.csv"
CSV_COLUMNS = ["student_ref", "question_id", "answer", "score"]

WRONG_RATE = {"agile": 0.25, "scrum": 0.75, "requirements": 0.15}
STU001_WRONG = {"Q1": "A", "Q2": "A", "Q4": "A", "Q5": "A"}


def build_rows(seed: int = 2026) -> list[dict]:
    rng = random.Random(seed)
    rows = []
    for index in range(1, len(STUDENT_NAMES) + 1):
        ref = student_ref(index)
        for code, concept, _prompt, options, key in QUESTIONS:
            wrong_keys = [o["key"] for o in options if o["key"] != key]
            if index == 1:
                answer = STU001_WRONG.get(code, key)
            elif rng.random() < WRONG_RATE[concept]:
                answer = "A" if concept == "scrum" and "A" in wrong_keys and rng.random() < 0.7 else rng.choice(wrong_keys)
            else:
                answer = key
            rows.append({"student_ref": ref, "question_id": code, "answer": answer, "score": int(answer == key)})
    return rows


def write_results_csv(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(build_rows())
    return path


if __name__ == "__main__":
    out = write_results_csv(settings.data_dir / "sample" / RESULTS_FILENAME)
    print(f"Wrote {out}")
